const service = require('../services/inventory.service');

async function products(request, response) { response.json(await service.listProducts(request.user, request.query)); }
async function product(request, response) { response.json({ product: await service.getProduct(request.user, request.params.id) }); }
async function createProduct(request, response) { response.status(201).json({ product: await service.createProduct(request.user, request.body) }); }
async function updateProduct(request, response) { response.json({ product: await service.updateProduct(request.user, request.params.id, request.body) }); }
async function stock(request, response) { response.json({ product: await service.updateStock(request.user, request.params.id, request.body) }); }
async function deleteProduct(request, response) { await service.deleteProduct(request.user, request.params.id); response.status(204).end(); }
async function dashboard(request, response) { response.json({ statistics: await service.statistics(request.user, request.query) }); }
async function reports(request, response) { response.json({ report: await service.statistics(request.user, request.query), generatedAt: new Date().toISOString() }); }
async function stores(request, response) { response.json({ stores: await service.listStores(request.user) }); }
async function createStore(request, response) { response.status(201).json({ store: await service.saveStore(null, request.body) }); }
async function updateStore(request, response) { response.json({ store: await service.saveStore(request.params.id, request.body) }); }
async function users(request, response) { response.json({ users: await service.listUsers() }); }
async function changeRole(request, response) { response.json({ user: await service.changeUserRole(request.user, request.params.id, request.body) }); }
async function roles(request, response) { response.json({ roles: await service.listRoles() }); }

module.exports = { products, product, createProduct, updateProduct, stock, deleteProduct, dashboard, reports, stores, createStore, updateStore, users, changeRole, roles };
