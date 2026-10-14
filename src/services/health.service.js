const mongoose = require('mongoose');

const DATABASE_STATES = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
});

function getHealth() {
  return {
    service: 'TechStore',
    status: 'ok',
    database: DATABASE_STATES[mongoose.connection.readyState] || 'unknown',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getHealth };
