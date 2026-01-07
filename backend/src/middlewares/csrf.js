const csurf = require('csurf');

const csrfProtection = csurf({
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
});

module.exports = function csrfMiddleware(req, res, next) {
  csrfProtection(req, res, next);
};
