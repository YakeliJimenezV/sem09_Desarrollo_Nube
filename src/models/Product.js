const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 60 },
  description: { type: String, trim: true, default: '', maxlength: 2000 },
  price: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isFinite, message: 'El precio debe ser un número finito.' },
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
    validate: { validator: Number.isSafeInteger, message: 'El stock debe ser un entero válido.' },
  },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ store: 1, active: 1 });

module.exports = mongoose.model('Product', productSchema);
