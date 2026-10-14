const ROLE_NAMES = Object.freeze(['ADMIN', 'GERENTE', 'EMPLEADO', 'AUDITOR']);

const SECURITY_POLICY = Object.freeze({
  passwordHashRounds: 12,
  maxFailedLoginAttempts: 5,
  mfaCodeLength: 6,
  mfaValidityMs: 5 * 60 * 1000,
  maxMfaAttempts: 3,
});

module.exports = { ROLE_NAMES, SECURITY_POLICY };
