const { randomBytes, createHash } = require('node:crypto');
const { OAuthState, User } = require('../models');
const { digest, encryptionKey } = require('./encryption.service');
const { beginAuthentication } = require('./mfa.service');
const { httpError } = require('./validation.service');

const providers = {
  google: { label: 'Google', authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile' },
  github: { label: 'GitHub', authorization: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', scope: 'read:user user:email' },
};

function configuration(provider) {
  const metadata = providers[provider];
  if (!metadata) throw httpError(404, 'NOT_FOUND', 'Proveedor no disponible.');
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const callback = process.env[`${prefix}_CALLBACK_URL`];
  let validCallback = false;
  try {
    const url = new URL(callback);
    validCallback = !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === `/api/auth/oauth/${provider}/callback` &&
      (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  } catch {}
  if (!clientId || !clientSecret || !validCallback) throw httpError(503, 'OAUTH_NOT_CONFIGURED', `El inicio de sesión con ${metadata.label} requiere configuración.`);
  return { ...metadata, clientId, clientSecret, callback };
}

function available(provider) { try { configuration(provider); return true; } catch { return false; } }

async function start(provider) {
  const config = configuration(provider);
  encryptionKey();
  const state = randomBytes(32).toString('base64url');
  const binding = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  await OAuthState.create({ stateHash: digest(state), bindingHash: digest(binding), provider, verifier, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  const parameters = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', scope: config.scope, state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  });
  return { binding, url: `${config.authorization}?${parameters}` };
}

async function providerRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw httpError(401, 'OAUTH_FAILED', 'No se pudo comprobar la identidad con el proveedor.');
  return response.json();
}

async function identity(provider, accessToken) {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'User-Agent': 'TechStore' };
  if (provider === 'google') {
    const profile = await providerRequest('https://openidconnect.googleapis.com/v1/userinfo', { headers });
    if (profile.email_verified !== true || typeof profile.sub !== 'string' || !profile.sub) throw httpError(401, 'OAUTH_FAILED', 'El proveedor debe confirmar un email verificado.');
    return { id: profile.sub, email: profile.email };
  }
  const [profile, emails] = await Promise.all([
    providerRequest('https://api.github.com/user', { headers }),
    providerRequest('https://api.github.com/user/emails', { headers }),
  ]);
  const email = Array.isArray(emails) && (emails.find((entry) => entry.verified && entry.primary) || emails.find((entry) => entry.verified));
  if (!Number.isSafeInteger(profile.id) || profile.id <= 0 || !email) throw httpError(401, 'OAUTH_FAILED', 'El proveedor debe confirmar un email verificado.');
  return { id: String(profile.id), email: email.email };
}

async function callback(provider, query, binding) {
  const config = configuration(provider);
  if (query.error || typeof query.code !== 'string' || !query.code || query.code.length > 2048 ||
    typeof query.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(query.state) || typeof binding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    throw httpError(401, 'OAUTH_FAILED', 'El intento de inicio de sesión no es válido.');
  }
  const state = await OAuthState.findOneAndUpdate({
    stateHash: digest(query.state), bindingHash: digest(binding), provider, consumed: false, expiresAt: { $gt: new Date() },
  }, { $set: { consumed: true } }, { returnDocument: 'after' }).select('+verifier');
  if (!state) throw httpError(401, 'OAUTH_FAILED', 'El intento de inicio de sesión expiró.');
  const tokens = await providerRequest(config.token, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: query.code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callback, code_verifier: state.verifier }),
  });
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw httpError(401, 'OAUTH_FAILED', 'No se pudo completar el inicio de sesión.');
  const profile = await identity(provider, tokens.access_token);
  if (typeof profile.email !== 'string' || profile.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw httpError(401, 'OAUTH_FAILED', 'El proveedor debe confirmar un email verificado.');
  const field = `${provider}Id`;
  let user = await User.findOne({ [field]: profile.id }).populate(['role', 'store']);
  if (!user) {
    user = await User.findOneAndUpdate({
      email: profile.email.trim().toLowerCase(), active: { $ne: false },
      $and: [{ $or: [{ [field]: { $exists: false } }, { [field]: profile.id }] }, { $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }] }],
    }, { $set: { [field]: profile.id } }, { returnDocument: 'after' }).populate(['role', 'store']);
  }
  if (!user) throw httpError(401, 'OAUTH_REGISTRATION_REQUIRED', 'Primero registra tu cuenta TechStore con el mismo email verificado del proveedor y una tienda asignada.');
  if (user.active === false || (user.lockUntil && user.lockUntil > new Date())) throw httpError(401, 'OAUTH_FAILED', 'El acceso no está disponible. Intenta nuevamente más tarde.');
  return beginAuthentication(user);
}

module.exports = { available, configuration, start, callback };
