const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: Number, required: true },
  type: { type: String, enum: ['setup', 'verify'], required: true },
  secretEncrypted: { type: String, select: false },
  attempts: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  processing: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

module.exports = mongoose.model('AuthChallenge', schema);
