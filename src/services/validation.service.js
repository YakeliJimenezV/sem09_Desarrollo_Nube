const mongoose = require('mongoose');

function httpError(status, code, message, fields) {
  const error = new Error(message);
  Object.assign(error, { status, code, fields, exposed: true });
  return error;
}

function invalid(fields) {
  return httpError(422, 'VALIDATION_ERROR', 'Revisa los campos indicados.', fields);
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid({ form: 'Envía un objeto válido.' });
  return body;
}

function onlyFields(body, allowed) {
  requireObject(body);
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw httpError(400, 'INVALID_FIELDS', 'La solicitud contiene campos no permitidos.');
  }
}

function validId(value) {
  return typeof value === 'string' && mongoose.isObjectIdOrHexString(value);
}

function passwordError(value) {
  if (typeof value !== 'string' || value.length < 8) return 'Usa al menos 8 caracteres.';
  if (Buffer.byteLength(value, 'utf8') > 72) return 'No superes 72 bytes UTF-8.';
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^\p{L}\p{N}\s]/u.test(value)) {
    return 'Incluye una mayúscula, un número y un carácter especial.';
  }
  return null;
}

function validateRegistration(body) {
  onlyFields(body, ['fullName', 'email', 'password', 'confirmPassword', 'store']);
  const fields = {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (fullName.length < 2 || fullName.length > 120) fields.fullName = 'Ingresa tu nombre completo (2–120 caracteres).';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Ingresa un email válido.';
  const passwordMessage = passwordError(body.password);
  if (passwordMessage) fields.password = passwordMessage;
  if (typeof body.confirmPassword !== 'string' || !body.confirmPassword || body.confirmPassword !== body.password) {
    fields.confirmPassword = 'Las contraseñas deben coincidir.';
  }
  if (!validId(body.store)) fields.store = 'Selecciona una tienda válida.';
  if (Object.keys(fields).length) throw invalid(fields);
  return { fullName, email, password: body.password, store: body.store };
}

function validateLogin(body) {
  onlyFields(body, ['email', 'password']);
  const fields = {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Ingresa un email válido.';
  if (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 72) fields.password = 'Ingresa una contraseña válida.';
  if (Object.keys(fields).length) throw invalid(fields);
  return { email, password: body.password };
}

module.exports = { httpError, invalid, onlyFields, validId, passwordError, validateRegistration, validateLogin };
