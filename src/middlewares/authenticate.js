const { User } = require('../models');
const { verifyAccessToken } = require('../services/token.service');
const { httpError, validId } = require('../services/validation.service');

async function authenticate(request, response, next) {
  const header = request.get('Authorization');
  const match = typeof header === 'string' && /^Bearer ([^\s]+)$/i.exec(header);
  const denied = () => httpError(401, 'UNAUTHENTICATED', 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.');
  if (!match) throw denied();
  let claims;
  try { claims = verifyAccessToken(match[1]); } catch (error) {
    if (error.code === 'CONFIGURATION_ERROR') throw error;
    throw denied();
  }
  if (!claims || typeof claims !== 'object' || !Number.isFinite(claims.exp) || !validId(claims.sub) || !Number.isInteger(claims.ver) || claims.ver < 0) throw denied();
  const user = await User.findById(claims.sub).populate(['role', 'store']);
  if (!user?.role || user.active === false || !user.mfaEnabled || claims.mfa !== true || claims.ver !== (user.tokenVersion || 0)) throw denied();
  if (['GERENTE', 'EMPLEADO'].includes(user.role.name) && !user.store?.active) throw denied();
  request.user = user;
  next();
}

module.exports = authenticate;
