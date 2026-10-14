const mongoose = require('mongoose');
const { Product, Store, User, Role } = require('../models');
const { publicUser } = require('./auth.service');
const { httpError, invalid, onlyFields, validId } = require('./validation.service');
const { ROLE_NAMES } = require('../config/security');

function storeScope(user) {
  return ['GERENTE', 'EMPLEADO'].includes(user.role.name) ? { store: user.store._id } : {};
}

function assertStoreAccess(user, storeId) {
  if (!validId(storeId)) throw invalid({ store: 'La tienda no es válida.' });
  if (['GERENTE', 'EMPLEADO'].includes(user.role.name) && String(user.store._id) !== storeId) {
    throw httpError(403, 'FORBIDDEN', 'No tienes acceso a esa tienda.');
  }
}

function resourceId(id) {
  if (!validId(id)) throw httpError(400, 'INVALID_ID', 'El identificador no es válido.');
  return id;
}

async function listProducts(user, query) {
  const filter = storeScope(user);
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'INVALID_QUERY', 'La paginación no es válida.');
  if (query.store !== undefined) { assertStoreAccess(user, query.store); filter.store = query.store; }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 160) throw httpError(400, 'INVALID_QUERY', 'La búsqueda no es válida.');
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { sku: { $regex: escaped, $options: 'i' } }];
  }
  const [products, total] = await Promise.all([
    Product.find(filter).populate('store', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return { products, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function getProduct(user, id) {
  const product = await Product.findById(resourceId(id)).populate('store', 'name');
  if (!product) throw httpError(404, 'NOT_FOUND', 'Producto no encontrado.');
  assertStoreAccess(user, String(product.store._id));
  return product;
}

function validateProductData(body, creating = false) {
  onlyFields(body, ['name', 'sku', 'description', 'price', 'stock', 'store', 'active']);
  const fields = {};
  for (const [field, maximum] of [['name', 160], ['sku', 60], ['description', 2000]]) {
    if ((creating && field !== 'description') || body[field] !== undefined) {
      if (typeof body[field] !== 'string' || (field !== 'description' && !body[field].trim()) || body[field].length > maximum) fields[field] = 'Ingresa un texto válido.';
    }
  }
  if ((creating || body.price !== undefined) && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) fields.price = 'Ingresa un precio válido.';
  if ((creating || body.stock !== undefined) && (!Number.isSafeInteger(body.stock) || body.stock < 0)) fields.stock = 'Ingresa un stock entero no negativo.';
  if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'El estado debe ser verdadero o falso.';
  if (Object.keys(fields).length) throw invalid(fields);
  if (!creating && !Object.keys(body).length) throw invalid({ form: 'Envía al menos un campo.' });
  return { ...body };
}

async function activeStore(id) {
  if (!validId(id) || !await Store.exists({ _id: id, active: true })) throw invalid({ store: 'Selecciona una tienda activa.' });
}

async function createProduct(user, body) {
  const data = validateProductData(body, true);
  const storeId = data.store || (user.role.name === 'GERENTE' ? String(user.store._id) : null);
  assertStoreAccess(user, storeId);
  await activeStore(storeId);
  return Product.create({ ...data, store: storeId });
}

async function updateProduct(user, id, body) {
  await getProduct(user, id);
  const data = validateProductData(body);
  if (data.store !== undefined) { assertStoreAccess(user, data.store); await activeStore(data.store); }
  const product = await Product.findOneAndUpdate({ _id: resourceId(id), ...storeScope(user) }, { $set: data }, { returnDocument: 'after', runValidators: true }).populate('store', 'name');
  if (!product) throw httpError(404, 'NOT_FOUND', 'Producto no encontrado.');
  return product;
}

async function updateStock(user, id, body) {
  if (user.role.name === 'EMPLEADO' && body && typeof body === 'object' && Object.keys(body).some((field) => field !== 'stock')) {
    throw httpError(403, 'FORBIDDEN', 'Solo puedes actualizar el stock. No puedes modificar precios ni otros datos del producto.');
  }
  onlyFields(body, ['stock']);
  await getProduct(user, id);
  if (!Number.isSafeInteger(body.stock) || body.stock < 0) throw invalid({ stock: 'Ingresa un stock entero no negativo.' });
  const product = await Product.findOneAndUpdate({ _id: resourceId(id), ...storeScope(user) }, { $set: { stock: body.stock } }, { returnDocument: 'after', runValidators: true });
  if (!product) throw httpError(404, 'NOT_FOUND', 'Producto no encontrado.');
  return product;
}

async function deleteProduct(user, id) {
  await getProduct(user, id);
  const result = await Product.deleteOne({ _id: resourceId(id), ...storeScope(user) });
  if (!result.deletedCount) throw httpError(404, 'NOT_FOUND', 'Producto no encontrado.');
}

async function statistics(user, query = {}) {
  const filter = storeScope(user);
  if (query.store !== undefined) {
    assertStoreAccess(user, query.store);
    filter.store = new mongoose.Types.ObjectId(query.store);
  }
  const [result, stores] = await Promise.all([
    Product.aggregate([{ $match: filter }, { $group: { _id: null, products: { $sum: 1 }, stock: { $sum: '$stock' }, lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', 10] }] }, 1, 0] } }, noStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } }, value: { $sum: { $multiply: ['$price', '$stock'] } } } }]),
    Store.countDocuments(filter.store ? { _id: filter.store, active: true } : { active: true }),
  ]);
  const totals = result[0] || { products: 0, stock: 0, lowStock: 0, noStock: 0, value: 0 };
  delete totals._id;
  return { ...totals, stockReview: totals.lowStock + totals.noStock, stores };
}

async function listStores(user) {
  const scope = ['GERENTE', 'EMPLEADO'].includes(user.role.name) ? { _id: user.store._id } : {};
  const stores = await Store.find(scope).sort({ name: 1 }).lean();
  const counts = await Product.aggregate([{ $match: { store: { $in: stores.map((store) => store._id) } } }, { $group: { _id: '$store', products: { $sum: 1 }, stock: { $sum: '$stock' } } }]);
  const totals = new Map(counts.map((entry) => [String(entry._id), entry]));
  return stores.map((store) => ({ ...store, products: totals.get(String(store._id))?.products || 0, stock: totals.get(String(store._id))?.stock || 0 }));
}

async function saveStore(id, body) {
  onlyFields(body, ['name', 'address', 'active']);
  const fields = {};
  for (const [field, max] of [['name', 120], ['address', 300]]) {
    if (!id || body[field] !== undefined) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > max) fields[field] = 'Ingresa un texto válido.';
    }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'El estado debe ser verdadero o falso.';
  if (Object.keys(fields).length) throw invalid(fields);
  if (!id) return Store.create(body);
  const store = await Store.findById(resourceId(id));
  if (!store) throw httpError(404, 'NOT_FOUND', 'Tienda no encontrada.');
  store.set(body);
  return store.save();
}

async function listUsers() {
  const users = await User.find().select('-failedLoginAttempts -lockUntil -tokenVersion').populate(['role', 'store']).sort({ fullName: 1 }).limit(200);
  return users.map(publicUser);
}

async function changeUserRole(actor, id, body) {
  onlyFields(body, ['role', 'store']);
  if (!ROLE_NAMES.includes(body.role)) throw invalid({ role: 'Selecciona un rol válido.' });
  const user = await User.findById(resourceId(id));
  if (!user) throw httpError(404, 'NOT_FOUND', 'Usuario no encontrado.');
  if (String(actor._id) === id && body.role !== 'ADMIN') throw httpError(400, 'SELF_DEMOTION', 'No puedes quitarte tu propio acceso administrativo.');
  const storeId = body.store === undefined ? (user.store ? String(user.store) : null) : body.store;
  if (storeId !== null || ['GERENTE', 'EMPLEADO'].includes(body.role)) await activeStore(storeId);
  const role = await Role.findOne({ name: body.role });
  user.role = role._id;
  user.store = storeId;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await user.populate(['role', 'store']);
  return publicUser(user);
}

async function listRoles() { return Role.find().select('name permissions').sort({ name: 1 }).lean(); }

module.exports = { listProducts, getProduct, createProduct, updateProduct, updateStock, deleteProduct, statistics, listStores, saveStore, listUsers, changeUserRole, listRoles };
