// backend/src/routes/settings.routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Stockage fichier (simple, safe, sans DB)
const SETTINGS_FILE = path.join(__dirname, '../../data/site-settings.json');

const DEFAULT_SETTINGS = {
  theme: {
    accent: '#ff2d55',
    background: '#ffffff',
    text: '#101223'
  },
  brand: {
    logo_url: '',          // URL ou vide
    store_name: 'Dynamite' // fallback si besoin
  },
  cta: {
    primary_text: 'Voir la boutique',
    primary_href: 'shop.html'
  },
  footer: {
    instagram: '',
    facebook: ''
  }
};

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return deepMerge(DEFAULT_SETTINGS, parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// merge “gentil” (sans lib)
function deepMerge(base, patch) {
  if (patch == null || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Public
 * GET /api/public/settings
 */
router.get('/public', asyncHandler(async (req, res) => {
  const settings = readSettings();
  res.json({ status: 'ok', settings });
}));

/**
 * Admin (protégé par requireAdmin dans app.js)
 * GET /api/admin/settings
 * PATCH /api/admin/settings
 */
router.get('/admin', asyncHandler(async (req, res) => {
  const settings = readSettings();
  res.json({ status: 'ok', settings });
}));

router.patch('/admin', asyncHandler(async (req, res) => {
  const current = readSettings();
  const patch = req.body && typeof req.body === 'object' ? req.body : {};
  const merged = deepMerge(current, patch);

  // mini garde-fous
  if (merged?.theme?.accent && typeof merged.theme.accent !== 'string') merged.theme.accent = DEFAULT_SETTINGS.theme.accent;
  if (merged?.theme?.background && typeof merged.theme.background !== 'string') merged.theme.background = DEFAULT_SETTINGS.theme.background;
  if (merged?.theme?.text && typeof merged.theme.text !== 'string') merged.theme.text = DEFAULT_SETTINGS.theme.text;

  writeSettings(merged);
  res.json({ status: 'ok', settings: merged });
}));

module.exports = router;
