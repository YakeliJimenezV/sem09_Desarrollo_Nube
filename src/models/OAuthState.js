const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  bindingHash: { type: String, required: true },
  provider: { type: String, enum: ['google', 'github'], required: true },
  verifier: { type: String, required: true, select: false },
  consumed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

module.exports = mongoose.model('OAuthState', schema);
