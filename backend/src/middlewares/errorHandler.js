const AppError = require('../errors/AppError');

function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;

  const status = isAppError ? err.status : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message = isAppError
    ? err.message
    : 'Une erreur interne est survenue';

  // Log serveur
  console.error({
    type: 'ERROR',
    code,
    status,
    route: `${req.method} ${req.originalUrl}`,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });

  res.status(status).json({
    error: true,
    code,
    message
  });
}

module.exports = errorHandler;
