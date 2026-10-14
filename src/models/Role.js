const mongoose = require('mongoose');
const { ROLE_NAMES } = require('../config/security');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    enum: ROLE_NAMES,
  },
  permissions: {
    type: [{ type: String, trim: true, maxlength: 100 }],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
