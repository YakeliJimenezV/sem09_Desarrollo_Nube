const { ROLE_NAMES } = require('../config/security');
const { httpError } = require('../services/validation.service');

function authorize(...roles) {
  const allowed = roles.flat();
  if (!allowed.length || allowed.some((role) => !ROLE_NAMES.includes(role))) throw new Error('Configuración de roles inválida.');
  return (request, response, next) => {
    if (!request.user) throw httpError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');
    if (request.user.role.name !== 'ADMIN' && !allowed.includes(request.user.role.name)) {
      throw httpError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta operación.');
    }
    next();
  };
}

module.exports = authorize;
