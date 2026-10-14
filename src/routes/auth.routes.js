const express = require('express');
const controller = require('../controllers/auth.controller');
const authenticate = require('../middlewares/authenticate');
const databaseReady = require('../middlewares/databaseReady');
const authRateLimit = require('../middlewares/authRateLimit');
const mfa = require('../controllers/mfa.controller');
const oauth = require('../controllers/oauth.controller');

const router = express.Router();
router.use(databaseReady);
router.get('/stores', controller.stores);
router.post('/register', authRateLimit(20), controller.register);
router.post('/login', authRateLimit(60), controller.login);
router.get('/mfa/challenge', mfa.information);
router.get('/mfa/qr', mfa.qr);
router.post('/mfa/verify', authRateLimit(60), mfa.verify);
router.get('/oauth/config', oauth.configuration);
router.get('/oauth/handoff', oauth.handoff);
router.get('/oauth/:provider/callback', oauth.callback);
router.get('/oauth/:provider', authRateLimit(30), oauth.start);
router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
