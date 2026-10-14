const TechStoreDemo = Object.freeze({
  stores: [
    { id: 'centro', name: 'TechStore Centro', location: 'Lima · Centro' },
    { id: 'miraflores', name: 'TechStore Miraflores', location: 'Lima · Miraflores' },
    { id: 'san-miguel', name: 'TechStore San Miguel', location: 'Lima · San Miguel' },
  ],
  products: [
    { name: 'Ultrabook Pro 14"', sku: 'TS-LAP-001', category: 'Laptops', icon: 'laptop', price: 2899, stock: 24, store: 'centro' },
    { name: 'Monitor QHD 27"', sku: 'TS-MON-002', category: 'Monitores', icon: 'monitor', price: 1199, stock: 18, store: 'miraflores' },
    { name: 'Auriculares inalámbricos', sku: 'TS-AUD-003', category: 'Audio', icon: 'headphones', price: 249, stock: 6, store: 'san-miguel' },
    { name: 'Teclado mecánico RGB', sku: 'TS-TEC-004', category: 'Periféricos', icon: 'keyboard', price: 199, stock: 46, store: 'centro' },
    { name: 'Mouse ergonómico', sku: 'TS-MOU-005', category: 'Periféricos', icon: 'mouse', price: 89, stock: 85, store: 'miraflores' },
    { name: 'SSD portátil 1 TB', sku: 'TS-SSD-006', category: 'Almacenamiento', icon: 'drive', price: 399, stock: 3, store: 'san-miguel' },
    { name: 'Hub USB-C 7 en 1', sku: 'TS-HUB-007', category: 'Accesorios', icon: 'layers', price: 189, stock: 37, store: 'centro' },
    { name: 'Cámara web Full HD', sku: 'TS-CAM-008', category: 'Accesorios', icon: 'monitor', price: 149, stock: 28, store: 'san-miguel' },
  ],
});
