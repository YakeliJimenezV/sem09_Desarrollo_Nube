
const express = require('express');
const path = require('node:path');

const {
  home,
  login,
  register,
  dashboard,
  mfa,
} = require('../controllers/page.controller');

const router = express.Router();

router.get('/', home);
router.get('/login', login);
router.get('/register', register);
router.get(['/mfa', '/mfa/setup'], mfa);

router.get(
  ['/dashboard', '/inventory', '/stores', '/users', '/roles', '/reports', '/account'],
  dashboard
);

// Página de gestión de imágenes Amazon S3.
// La autenticación JWT se verificará en sus solicitudes API.
router.get('/s3', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.resolve(__dirname, '../../views/s3.html'));
});

module.exports = router;
