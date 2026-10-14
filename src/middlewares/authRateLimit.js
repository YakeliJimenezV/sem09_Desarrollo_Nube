const { httpError } = require('../services/validation.service');

function authRateLimit(maximum) {
  const clients = new Map();
  const windowMs = 15 * 60 * 1000;
  return (request, response, next) => {
    const now = Date.now();
    let entry = clients.get(request.ip);
    if (!entry || entry.until <= now) {
      if (clients.size >= 5000) {
        for (const [key, value] of clients) if (value.until <= now) clients.delete(key);
        if (clients.size >= 5000) throw httpError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta más tarde.');
      }
      entry = { count: 0, until: now + windowMs };
      clients.set(request.ip, entry);
    }
    entry.count += 1;
    if (entry.count > maximum) {
      response.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      throw httpError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta más tarde.');
    }
    next();
  };
}

module.exports = authRateLimit;
