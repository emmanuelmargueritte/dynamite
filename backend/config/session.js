// backend/config/session.js
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

module.exports = function createSessionMiddleware(pool) {
  const isProd = process.env.NODE_ENV === 'production';

  // En prod, on exige un vrai secret
  if (isProd && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }

  return session({
    name: 'admin_session',
    store: new pgSession({
      pool,
      tableName: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,

    // Important si tu es derrière un proxy en prod (Render/Heroku/Nginx/etc.)
    // (ça aide express-session à gérer secure cookies correctement)
    proxy: isProd,

    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // ✅ prod: true / local: false
      maxAge: 24 * 60 * 60 * 1000 // 24h
    }
  });
};
