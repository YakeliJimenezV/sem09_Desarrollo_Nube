const jwt = require('jsonwebtoken');
const { getAuthConfiguration } = require('../config/env');

const issuer = 'techstore';
const audience = 'techstore-web';

function issueAccessToken(user) {
  if (!user.mfaEnabled || user.active === false) throw new Error('MFA is required before issuing an access token.');
  const { secret, expirySeconds } = getAuthConfiguration();
  const token = jwt.sign({
    role: user.role.name,
    store: user.store ? String(user.store._id) : null,
    ver: user.tokenVersion || 0,
    mfa: true,
  }, secret, { algorithm: 'HS256', subject: String(user._id), expiresIn: expirySeconds, issuer, audience });
  return { token, expiresIn: expirySeconds };
}

function verifyAccessToken(token) {
  const { secret } = getAuthConfiguration();
  return jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
}

module.exports = { issueAccessToken, verifyAccessToken };
