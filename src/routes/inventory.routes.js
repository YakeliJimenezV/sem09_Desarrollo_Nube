const express = require('express');
const controller = require('../controllers/inventory.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const databaseReady = require('../middlewares/databaseReady');

const router = express.Router();
router.use(databaseReady, authenticate);
router.get('/dashboard', controller.dashboard);
router.get('/products', controller.products);
router.get('/products/:id', controller.product);
router.post('/products', authorize('GERENTE'), controller.createProduct);
router.patch('/products/:id/stock', authorize('GERENTE', 'EMPLEADO'), controller.stock);
router.patch('/products/:id', authorize('GERENTE'), controller.updateProduct);
router.delete('/products/:id', authorize('GERENTE'), controller.deleteProduct);
router.get('/reports', authorize('GERENTE', 'AUDITOR'), controller.reports);
router.get('/stores', authorize('GERENTE', 'EMPLEADO', 'AUDITOR'), controller.stores);
router.post('/stores', authorize('ADMIN'), controller.createStore);
router.patch('/stores/:id', authorize('ADMIN'), controller.updateStore);
router.get('/users', authorize('AUDITOR'), controller.users);
router.patch('/users/:id/role', authorize('ADMIN'), controller.changeRole);
router.get('/roles', authorize('AUDITOR'), controller.roles);

module.exports = router;
