const mongoose = require('mongoose');
const { httpError } = require('../services/validation.service');

function databaseReady(request, response, next) {
  if (mongoose.connection.readyState !== 1) throw httpError(503, 'NOT_READY', 'El servicio no está disponible. Intenta nuevamente más tarde.');
  response.set('Cache-Control', 'no-store');
  next();
}

module.exports = databaseReady;
