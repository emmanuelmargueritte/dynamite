const express = require('express');
const router = express.Router();

const adminLoginRateLimit = require('../middlewares/adminLoginRateLimit');
const { comparePassword } = require('../utils/password');
const { pool } = require('../utils/db');

/**
 * GET /api/admin/auth/csrf-token
 */
router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

/**
 * POST /api/admin/auth/login
 * Vérifie les identifiants admin (sans créer de session encore)
 */
router.post('/login', adminLoginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const result = await pool.query(
      'SELECT id, password_hash FROM admins WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const passwordOk = await comparePassword(password, admin.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

   // ✅ Identifiants valides → création de la session admin
req.session.admin = {
  id: admin.id,
  email
};

return res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/auth/me
 * Vérifie si un admin est connecté
 */
router.get('/me', (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    id: req.session.admin.id,
    email: req.session.admin.email
  });
});
/**
 * POST /api/admin/auth/logout
 * Déconnecte l’admin
 */
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.clearCookie('dynamite.sid'); // ou le nom réel de ton cookie
    res.json({ success: true });
  });
});


module.exports = router;
