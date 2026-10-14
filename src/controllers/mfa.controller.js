const mfa = require('../services/mfa.service');
const { httpError } = require('../services/validation.service');

function token(request) {
  const match = /^MFA ([A-Za-z0-9_-]{43})$/.exec(request.get('Authorization') || '');
  if (!match) throw httpError(401, 'MFA_EXPIRED', 'Inicia sesión nuevamente para verificar tu identidad.');
  return match[1];
}

async function information(request, response) { response.json(await mfa.information(token(request))); }
async function qr(request, response) { response.type('png').send(await mfa.qr(token(request))); }
async function verify(request, response) { response.json(await mfa.verifyCode(token(request), request.body)); }

module.exports = { information, qr, verify };
