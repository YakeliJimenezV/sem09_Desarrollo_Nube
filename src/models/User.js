const mongoose = require('mongoose');
const { hashPassword } = require('../services/password.service');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Ingresa un correo válido.'],
  },
  password: {
    type: String,
    required: true,
    select: false,
    minlength: 8,
    validate: {
      validator: (value) => Buffer.byteLength(value, 'utf8') <= 72,
      message: 'La contraseña no puede superar 72 bytes UTF-8.',
    },
  },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: Number.isSafeInteger, message: 'Los intentos deben ser un entero válido.' },
  },
  lockUntil: { type: Date, default: null },
  tokenVersion: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecretEncrypted: { type: String, select: false },
  mfaLastStep: { type: Number, default: -1, select: false },
  googleId: { type: String, unique: true, sparse: true, select: false },
  githubId: { type: String, unique: true, sparse: true, select: false },
}, {
  timestamps: true,
  toJSON: {
    transform(document, result) {
      delete result.password;
      delete result.__v;
      delete result.tokenVersion;
      delete result.failedLoginAttempts;
      delete result.lockUntil;
      delete result.mfaSecretEncrypted;
      delete result.mfaLastStep;
      delete result.googleId;
      delete result.githubId;
      return result;
    },
  },
});

userSchema.pre('save', async function hashModifiedPassword() {
  if (this.isModified('password')) {
    this.password = await hashPassword(this.password);
  }
});

module.exports = mongoose.model('User', userSchema);
