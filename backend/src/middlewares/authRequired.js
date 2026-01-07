module.exports = function authRequired(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  return next();
};
