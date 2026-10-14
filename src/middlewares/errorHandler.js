function notFound(request, response) {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } });
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : (error.exposed && error.status === 503 ? 503 : 500);

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } });
  }
  if (error.code === 11000) {
    return response.status(409).json({ error: { code: 'CONFLICT', message: 'Ya existe un recurso con esos datos únicos.' } });
  }

  response.status(status).json({
    error: {
      code: error.exposed ? error.code : (status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST'),
      message: error.exposed ? error.message : (status === 500 ? 'Ocurrió un error interno.' : 'La solicitud no es válida.'),
      ...(error.exposed && error.fields ? { fields: error.fields } : {}),
      ...(error.exposed && Number.isInteger(error.remainingAttempts) ? { remainingAttempts: error.remainingAttempts } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
