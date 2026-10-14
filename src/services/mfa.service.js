const { randomBytes } = require('node:crypto');
const { generateSecret, generateURI, verify } = require('otplib');
const QRCode = require('qrcode');
const { AuthChallenge, User } = require('../models');
const { SECURITY_POLICY } = require('../config/security');
const { encryptionKey, encryptSecret, decryptSecret, digest } = require('./encryption.service');
const { httpError, onlyFields, invalid } = require('./validation.service');
const { issueAccessToken } = require('./token.service');

const expired = () => httpError(401, 'MFA_EXPIRED', 'El intento de autenticación expiró. Inicia sesión nuevamente.');

async function beginAuthentication(user) {
  encryptionKey();
  if (user.active === false || !user.role || (['GERENTE', 'EMPLEADO'].includes(user.role.name) && !user.store?.active)) throw expired();
  const challengeToken = randomBytes(32).toString('base64url');
  const type = user.mfaEnabled ? 'verify' : 'setup';
  const expiresAt = new Date(Date.now() + SECURITY_POLICY.mfaValidityMs);
  await AuthChallenge.create({
    tokenHash: digest(challengeToken), user: user._id, version: user.tokenVersion || 0, type, expiresAt,
    ...(type === 'setup' ? { secretEncrypted: encryptSecret(generateSecret()) } : {}),
  });
  return { mfaRequired: true, type, challengeToken, expiresAt: expiresAt.toISOString() };
}

function challengeFilter(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw expired();
  return { tokenHash: digest(token), consumed: false, attempts: { $lt: SECURITY_POLICY.maxMfaAttempts }, expiresAt: { $gt: new Date() } };
}

async function challengeUser(challenge) {
  const user = await User.findById(challenge.user).select('+mfaSecretEncrypted +mfaLastStep').populate(['role', 'store']);
  if (!user?.role || user.active === false || (user.tokenVersion || 0) !== challenge.version ||
    (challenge.type === 'setup' && user.mfaEnabled) || (challenge.type === 'verify' && !user.mfaEnabled) ||
    (user.lockUntil && user.lockUntil > new Date()) ||
    (['GERENTE', 'EMPLEADO'].includes(user.role.name) && !user.store?.active)) throw expired();
  return user;
}

async function getChallenge(token) {
  const challenge = await AuthChallenge.findOne(challengeFilter(token)).select('+secretEncrypted');
  if (!challenge) throw expired();
  const user = await challengeUser(challenge);
  return { challenge, user };
}

async function information(token) {
  const { challenge } = await getChallenge(token);
  return { type: challenge.type, expiresAt: challenge.expiresAt, remainingAttempts: SECURITY_POLICY.maxMfaAttempts - challenge.attempts };
}

async function qr(token) {
  const { challenge, user } = await getChallenge(token);
  if (challenge.type !== 'setup') throw httpError(403, 'MFA_ALREADY_CONFIGURED', 'La autenticación en dos pasos ya está configurada.');
  const uri = generateURI({ issuer: 'TechStore', label: user.email, secret: decryptSecret(challenge.secretEncrypted), digits: 6, period: 30, algorithm: 'sha1' });
  return QRCode.toBuffer(uri, { type: 'png', width: 320, margin: 3, errorCorrectionLevel: 'M' });
}

async function verifyCode(token, body) {
  onlyFields(body, ['code']);
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw invalid({ code: 'Ingresa exactamente 6 dígitos.' });
  const challenge = await AuthChallenge.findOneAndUpdate({ ...challengeFilter(token), processing: false }, { $set: { processing: true } }, { returnDocument: 'after' }).select('+secretEncrypted');
  if (!challenge) throw expired();
  try {
    const user = await challengeUser(challenge);
    const secret = decryptSecret(challenge.type === 'setup' ? challenge.secretEncrypted : user.mfaSecretEncrypted);
    const result = await verify({ secret, token: body.code, digits: 6, period: 30, epochTolerance: [30, 0], ...(user.mfaLastStep >= 0 ? { afterTimeStep: user.mfaLastStep } : {}) });
    if (!result.valid) {
      const updated = await AuthChallenge.findOneAndUpdate({ _id: challenge._id, consumed: false }, {
        $inc: { attempts: 1 }, $set: { processing: false, consumed: challenge.attempts + 1 >= SECURITY_POLICY.maxMfaAttempts },
      }, { returnDocument: 'after' });
      const remaining = Math.max(0, SECURITY_POLICY.maxMfaAttempts - (updated?.attempts || SECURITY_POLICY.maxMfaAttempts));
      const error = httpError(remaining ? 422 : 401, remaining ? 'MFA_INVALID_CODE' : 'MFA_ATTEMPTS_EXCEEDED', remaining
        ? `Código incorrecto o ya utilizado. Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${remaining} intentos`}.`
        : 'Se alcanzó el máximo de intentos. Inicia sesión nuevamente.');
      error.remainingAttempts = remaining;
      throw error;
    }
    const updatedUser = await User.findOneAndUpdate({
      _id: user._id, tokenVersion: challenge.version, active: { $ne: false },
      $or: [{ mfaLastStep: { $lt: result.timeStep } }, { mfaLastStep: { $exists: false } }],
      ...(challenge.type === 'setup' ? { mfaEnabled: { $ne: true } } : { mfaEnabled: true }),
    }, { $set: {
      mfaLastStep: result.timeStep, mfaEnabled: true,
      ...(challenge.type === 'setup' ? { mfaSecretEncrypted: challenge.secretEncrypted } : {}),
    } }, { returnDocument: 'after' }).populate(['role', 'store']);
    if (!updatedUser) throw expired();
    const consumed = await AuthChallenge.findOneAndUpdate({ _id: challenge._id, consumed: false, expiresAt: { $gt: new Date() } }, { $set: { consumed: true, processing: false }, $unset: { secretEncrypted: 1 } });
    if (!consumed) throw expired();
    const { publicUser } = require('./auth.service');
    return { ...issueAccessToken(updatedUser), user: publicUser(updatedUser), message: challenge.type === 'setup' ? 'MFA configurado correctamente.' : 'Verificación completada.' };
  } finally {
    await AuthChallenge.updateOne({ _id: challenge._id, processing: true }, { $set: { processing: false } });
  }
}

module.exports = { beginAuthentication, information, qr, verifyCode };
