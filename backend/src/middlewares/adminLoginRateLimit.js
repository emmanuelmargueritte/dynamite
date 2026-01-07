const rateLimit = require('express-rate-limit');

const adminLoginRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 tentatives max
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.'
  }
});

module.exports = adminLoginRateLimit;
