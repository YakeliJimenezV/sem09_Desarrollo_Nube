const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('node:crypto');
const { httpError } = require('./validation.service');

function encryptionKey() {
  const value = process.env.TOTP_ENCRYPTION_KEY || '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw httpError(503, 'MFA_CONFIGURATION_REQUIRED', 'La autenticación en dos pasos requiere configurar TOTP_ENCRYPTION_KEY en el servidor.');
  }
  return key;
}

function encryptSecret(secret) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from('techstore:totp:v1'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

function decryptSecret(value) {
  const key = encryptionKey();
  try {
    const [version, nonce, tag, data, extra] = value.split('.');
    if (version !== 'v1' || extra || !nonce || !tag || !data) throw new Error('Invalid format');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
    decipher.setAAD(Buffer.from('techstore:totp:v1'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw httpError(503, 'MFA_UNAVAILABLE', 'No se pudo verificar la autenticación en dos pasos. Contacta al administrador.');
  }
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

module.exports = { encryptionKey, encryptSecret, decryptSecret, digest };
