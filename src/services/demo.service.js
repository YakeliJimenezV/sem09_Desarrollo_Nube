const { Product, Store } = require('../models');

const demoProducts = [
  { name: 'Laptop Lenovo IdeaPad', sku: 'LEN-IDEA-001', price: 2499, stock: 15, description: 'Laptop para productividad y estudio.' },
  { name: 'Monitor LG 24"', sku: 'LG-MON-024', price: 699.90, stock: 8, description: 'Monitor de 24 pulgadas para tu espacio de trabajo.' },
  { name: 'Teclado Mecánico', sku: 'TEC-MEC-001', price: 189.90, stock: 25, description: 'Teclado mecánico para trabajo y gaming.' },
  { name: 'Mouse Logitech', sku: 'LOG-MOU-001', price: 89.90, stock: 5, description: 'Mouse ergonómico para uso diario.' },
  { name: 'Audífonos HyperX', sku: 'HYP-AUD-001', price: 299.90, stock: 0, description: 'Audífonos para comunicación y entretenimiento.' },
];

async function seedDemo() {
  const store = await Store.findOne({ name: 'TechStore Lima', active: true });
  if (!store) throw new Error('Debe existir la tienda activa TechStore Lima. No se creó ni modificó ninguna tienda.');
  let inserted = 0;
  for (const product of demoProducts) {
    const now = new Date();
    const result = await Product.updateOne({ sku: product.sku }, { $setOnInsert: { ...product, store: store._id, active: true, createdAt: now, updatedAt: now } }, { upsert: true, runValidators: true, timestamps: false });
    inserted += result.upsertedCount;
  }
  return { inserted, existing: demoProducts.length - inserted };
}

module.exports = { seedDemo, demoProducts };
