const { getHealth } = require('../services/health.service');

function health(request, response) {
  response.set('Cache-Control', 'no-store').json(getHealth());
}

function readiness(request, response) {
  const result = getHealth();
  const ready = result.database === 'connected';
  response.set('Cache-Control', 'no-store').status(ready ? 200 : 503).json({
    ...result,
    status: ready ? 'ready' : 'not_ready',
  });
}

module.exports = { health, readiness };
