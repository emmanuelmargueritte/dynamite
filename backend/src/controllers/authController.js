const bcrypt = require('bcrypt');
const User = require('../models/user.model');
const { pool } = require('../utils/db');
const { env } = require('../utils/env');
const { sanitizeEmail } = require('../utils/sanitize');

const getUserByEmail = async (email) => {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
  return rows[0] || null;
};

module.exports = {
  async getCsrfToken(req, res) {
    if (!env.CSRF_ENABLED) return res.json({ csrfToken: null });
    const token = typeof req.csrfToken === 'function' ? req.csrfToken() : null;
    return res.json({ csrfToken: token });
  },

  async register(req, res) {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password);

    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create(email, hash);
    req.session.userId = user.id;

    return res.status(201).json({ id: user.id, email: user.email, created_at: user.created_at });
  },

  async login(req, res) {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password);

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    return res.json({ id: user.id, email: user.email });
  },

  async logout(req, res) {
    req.session.destroy(() => {
      res.clearCookie(env.SESSION_COOKIE_NAME);
      return res.json({ ok: true });
    });
  },

  async me(req, res) {
    const userId = req.session?.userId || null;
    if (!userId) return res.json({ user: null });

    const { rows } = await pool.query(`SELECT id, email, created_at FROM users WHERE id=$1`, [userId]);
    return res.json({ user: rows[0] || null });
  }
};
