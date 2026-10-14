
const express = require('express');
const controller = require('../controllers/s3.controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const databaseReady = require('../middlewares/databaseReady');

const router = express.Router();

router.use(databaseReady, authenticate);

router.post('/upload-url', authorize('GERENTE'), controller.uploadUrl);
router.get('/images', authorize('GERENTE', 'EMPLEADO', 'AUDITOR'), controller.images);
router.delete('/images', authorize('GERENTE'), controller.removeImage);

module.exports = router;
