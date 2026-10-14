const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function configurationError(message) {
  const error = new Error(message);
  error.code = 'CONFIGURATION_ERROR';
  return error;
}

function getEnvironment({ preview = false } = {}) {
  const port = Number(process.env.PORT || 3000);
  const mongodbUri = process.env.MONGODB_URI?.trim();
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw configurationError('NODE_ENV debe ser development, test o production.');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw configurationError('PORT debe ser un entero entre 1 y 65535.');
  }

  if (!preview && !/^mongodb(?:\+srv)?:\/\//.test(mongodbUri || '')) {
    throw configurationError('Configura MONGODB_URI en .env con una URI de MongoDB válida.');
  }

  if (!preview) getAuthConfiguration();
  return Object.freeze({ port, mongodbUri, preview, nodeEnv });
}

function getAuthConfiguration() {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const duration = /^(\d+)(s|m|h|d)$/.exec(expiresIn);
  const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15);
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw configurationError('Configura JWT_SECRET en .env con un secreto propio de al menos 32 bytes.');
  }
  if (!duration || Number(duration[1]) < 1 || Number(duration[1]) > 86400) {
    throw configurationError('JWT_EXPIRES_IN debe indicar una duración positiva, por ejemplo 30m o 1h.');
  }
  const expirySeconds = Number(duration[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[duration[2]];
  if (expirySeconds > 7 * 86400) throw configurationError('JWT_EXPIRES_IN no puede superar 7 días.');
  if (!Number.isFinite(lockMinutes) || lockMinutes <= 0 || lockMinutes > 1440) {
    throw configurationError('LOGIN_LOCK_MINUTES debe ser un número mayor que 0 y menor o igual a 1440.');
  }
  return { secret, expirySeconds, lockDurationMs: lockMinutes * 60 * 1000 };
}

module.exports = { getEnvironment, getAuthConfiguration };
