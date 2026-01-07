const bcrypt = require('bcrypt');
const { pool } = require('../utils/db');
const { env } = require('../utils/env');
const { sanitizeEmail } = require('../utils/sanitize');
const Admin = require('../models/admin.model');

const getAdminById = async (id) => {
  const { rows } = await pool.query(`SELECT id, email, created_at FROM admins WHERE id=$1`, [id]);
  return rows[0] || null;
};

module.exports = {
  async login(req, res) {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password);

    const admin = await Admin.findByEmail(email);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, admin.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.adminId = admin.id;

    return res.json({
      id: admin.id,
      email: admin.email,
      twoFactorEnabled: env.TWO_FACTOR_ENABLED && Boolean(admin.two_factor_secret)
    });
  },

  async logout(req, res) {
    req.session.adminId = null;
    req.session.destroy(() => {
      res.clearCookie(env.SESSION_COOKIE_NAME);
      return res.json({ ok: true });
    });
  },

  async me(req, res) {
    const adminId = req.session?.adminId;
    const admin = await getAdminById(adminId);
    return res.json({ admin });
  },

  async createAdmin(req, res) {
    const currentCount = await Admin.count();
    if (currentCount >= env.ADMIN_MAX_ACCOUNTS) {
      return res.status(403).json({ error: `Admin limit reached (${env.ADMIN_MAX_ACCOUNTS})` });
    }

    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password);

    const existing = await Admin.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO admins (email, password_hash) VALUES ($1,$2) RETURNING id, email, created_at`,
      [email, hash]
    );

    return res.status(201).json({ admin: rows[0] });
  }
};
