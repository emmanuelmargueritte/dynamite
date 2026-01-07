const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

module.exports = function createSessionMiddleware(pool) {
  return session({
    name: 'admin_session',
    store: new pgSession({
      pool,
      tableName: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // dev only
      maxAge: 24 * 60 * 60 * 1000 // 24h
    }
  });
};
