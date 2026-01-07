class AppError extends Error {
  constructor(code, status, message, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = AppError;
