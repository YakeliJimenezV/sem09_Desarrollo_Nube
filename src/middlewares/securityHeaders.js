
function securityHeaders(request, response, next) {
  response.set({
    'X-Content-Type-Options': 'nosniff',

    'Referrer-Policy': 'no-referrer',

    'X-Frame-Options': 'DENY',

    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' blob: https://*.amazonaws.com",
      "font-src 'self'",
      "connect-src 'self' https://*.amazonaws.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; '),
  });

  next();
}

module.exports = securityHeaders;
