const oauth = require('../services/oauth.service');
const mfa = require('../services/mfa.service');
const { httpError } = require('../services/validation.service');

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth', maxAge: 5 * 60 * 1000 });

function cookie(request, name) {
  const value = (request.get('Cookie') || '').split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : '';
}

function configuration(request, response) { response.json({ google: oauth.available('google'), github: oauth.available('github') }); }

async function start(request, response) {
  const result = await oauth.start(request.params.provider);
  response.cookie(`techstore.oauth.${request.params.provider}`, result.binding, cookieOptions());
  response.redirect(result.url);
}

async function callback(request, response) {
  const provider = request.params.provider;
  const name = `techstore.oauth.${provider}`;
  const binding = cookie(request, name);
  response.clearCookie(name, { ...cookieOptions(), maxAge: undefined });
  try {
    const result = await oauth.callback(provider, request.query, binding);
    response.cookie('techstore.mfa.handoff', result.challengeToken, cookieOptions());
    response.redirect(result.type === 'setup' ? '/mfa/setup' : '/mfa');
  } catch (error) {
    const reason = error.code === 'OAUTH_REGISTRATION_REQUIRED' ? 'register' : (error.code === 'OAUTH_NOT_CONFIGURED' ? provider : (error.code === 'MFA_CONFIGURATION_REQUIRED' ? 'mfa-config' : 'failed'));
    response.redirect(`/login?oauth=${reason}`);
  }
}

async function handoff(request, response) {
  const challengeToken = cookie(request, 'techstore.mfa.handoff');
  response.clearCookie('techstore.mfa.handoff', { ...cookieOptions(), maxAge: undefined });
  if (!challengeToken) throw httpError(401, 'MFA_EXPIRED', 'Inicia sesión nuevamente.');
  const data = await mfa.information(challengeToken);
  response.json({ ...data, challengeToken, mfaRequired: true });
}

module.exports = { configuration, start, callback, handoff };
