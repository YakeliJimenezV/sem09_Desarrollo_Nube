const bcrypt = require('bcryptjs');
const { SECURITY_POLICY } = require('../config/security');
const { passwordError } = require('./validation.service');

async function hashPassword(password) {
  const message = passwordError(password);
  if (message) throw new Error(message);

  return bcrypt.hash(password, SECURITY_POLICY.passwordHashRounds);
}

module.exports = { hashPassword };
