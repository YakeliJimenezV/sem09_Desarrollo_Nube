const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { User, Role, Store } = require('../models');
const { SECURITY_POLICY } = require('../config/security');
const { getAuthConfiguration } = require('../config/env');
const { validateRegistration, validateLogin, invalid, httpError } = require('./validation.service');
const { beginAuthentication } = require('./mfa.service');

let dummyHash;

function publicUser(user) {
  return {
    id: String(user._id), fullName: user.fullName, email: user.email,
    role: user.role.name,
    active: user.active !== false, mfaEnabled: user.mfaEnabled === true,
    store: user.store ? { id: String(user.store._id), name: user.store.name, active: user.store.active } : null,
  };
}

async function register(body) {
  const data = validateRegistration(body);
  const [store, role] = await Promise.all([Store.findOne({ _id: data.store, active: true }), Role.findOne({ name: 'EMPLEADO' })]);
  if (!store) throw invalid({ store: 'Selecciona una tienda activa.' });
  if (!role) throw httpError(503, 'NOT_READY', 'El servicio todavía no está disponible.');
  try {
    const user = await User.create({ ...data, role: role._id });
    await user.populate(['role', 'store']);
    return { user: publicUser(user), message: 'Cuenta creada. Ya puedes iniciar sesión.' };
  } catch (error) {
    if (error.code === 11000) throw httpError(409, 'REGISTRATION_CONFLICT', 'No se pudo registrar ese email.', { email: 'Usa otro email o inicia sesión con tu cuenta.' });
    throw error;
  }
}

function loginDenied() {
  return httpError(401, 'LOGIN_DENIED', 'Credenciales no válidas o acceso temporalmente bloqueado. Intenta nuevamente más tarde.');
}

function unlockedFilter(now) {
  return { $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }] };
}

async function verifyCredentials(body) {
  const { email, password } = validateLogin(body);
  const user = await User.findOne({ email }).select('+password').populate(['role', 'store']);
  if (!dummyHash) dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), SECURITY_POLICY.passwordHashRounds);
  const matches = await bcrypt.compare(password, user ? user.password : await dummyHash);
  const now = new Date();
  if (!user || (user.lockUntil && user.lockUntil > now)) throw loginDenied();
  if (!matches) {
    const { lockDurationMs } = getAuthConfiguration();
    await User.updateOne({ _id: user._id, ...unlockedFilter(now) }, [
      { $set: { failedLoginAttempts: { $add: [
        { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$lockUntil', null] }, null] }, { $lte: ['$lockUntil', now] }] }, 0, { $ifNull: ['$failedLoginAttempts', 0] }] }, 1,
      ] } } },
      { $set: { lockUntil: { $cond: [{ $gte: ['$failedLoginAttempts', SECURITY_POLICY.maxFailedLoginAttempts] }, new Date(now.getTime() + lockDurationMs), { $ifNull: ['$lockUntil', null] }] } } },
    ], { updatePipeline: true });
    throw loginDenied();
  }
  if (user.active === false || !user.role || (['GERENTE', 'EMPLEADO'].includes(user.role.name) && !user.store?.active)) throw loginDenied();
  const verified = await User.findOneAndUpdate({ _id: user._id, password: user.password, ...unlockedFilter(now) }, {
    $set: { failedLoginAttempts: 0, lockUntil: null },
  }, { returnDocument: 'after' }).populate(['role', 'store']);
  if (!verified) throw loginDenied();
  return verified;
}

async function completeLogin(user) {
  return beginAuthentication(user);
}

async function login(body) {
  const user = await verifyCredentials(body);
  return completeLogin(user);
}

async function logout(user) {
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
}

module.exports = { register, login, verifyCredentials, completeLogin, logout, publicUser };
