const path = require('node:path');

function home(request, response) {
  response.sendFile(path.resolve(__dirname, '../../views/index.html'));
}

function login(request, response) { response.set('Cache-Control', 'no-store').sendFile(path.resolve(__dirname, '../../views/login.html')); }
function register(request, response) { response.set('Cache-Control', 'no-store').sendFile(path.resolve(__dirname, '../../views/register.html')); }
function dashboard(request, response) { response.set('Cache-Control', 'no-store').sendFile(path.resolve(__dirname, '../../views/dashboard.html')); }
function mfa(request, response) { response.set('Cache-Control', 'no-store').sendFile(path.resolve(__dirname, '../../views/mfa.html')); }

module.exports = { home, login, register, dashboard, mfa };
