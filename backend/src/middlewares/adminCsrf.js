const csrf = require('csurf');

const adminCsrfProtection = csrf({
  cookie: false // on utilise la session, PAS les cookies
});

module.exports = adminCsrfProtection;
