const Audit = require('../models/audit.model');

module.exports = function auditLog(action) {
  return async function auditLogMiddleware(req, res, next) {
    try {
      const adminId = req.session?.adminId || null;
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      await Audit.log(adminId, action, ip);
    } catch (_) {
      // non-bloquant
    }
    return next();
  };
};
