// backend/src/routes/ssr.routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');
const { env } = require('../utils/env');
const logEvent = require('../analytics/logEvent');

const router = express.Router();

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function getBaseUrl(req) {
  const configured = (env.PUBLIC_BASE_URL || '').trim();
  const base = configured || `${req.protocol}://${req.get('host')}`;
  return base.replace(/\/+$/, '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function normalizeCloudinary(url, transform) {
  if (!url) return url;
  const marker = '/image/upload/';
  if (!url.includes(marker)) return url;

  const [base, tail] = url.split(marker);
  if (!tail) return url;

  const parts = tail.split('/');
  if (parts[0]?.startsWith('v')) return `${base}${marker}${transform}/${tail}`;

  parts[0] = transform;
  return `${base}${marker}${parts.join('/')}`;
}

const TRANSFORM_SHOP = 'c_pad,g_center,w_320,h_426,b_rgb:ffffff,q_auto,f_auto';
const TRANSFORM_PDP_900 = 'c_pad,g_center,w_900,h_1200,b_rgb:ffffff,q_auto,f_auto';

let _tplShop = null;
let _tplProduct = null;

function frontendPath(rel) {
  return path.resolve(__dirname, '../../../frontend', rel);
}

function readTemplate(which) {
  if (which === 'shop') {
    if (_tplShop) return _tplShop;
    _tplShop = fs.readFileSync(frontendPath('shop.html'), 'utf8');
    return _tplShop;
  }
  if (which === 'product') {
    if (_tplProduct) return _tplProduct;
    _tplProduct = fs.readFileSync(frontendPath('product.html'), 'utf8');
    return _tplProduct;
  }
  throw new Error('Unknown template');
}

/**
 * SSR: PRODUCT PAGE
 * GET /p/<slug>-<uuid>
 */
router.get('/p/:slugAndId', asyncHandler(async (req, res, next) => {
  await logEvent({
    eventType: 'page_view',
    page: req.originalUrl,
    referrer: req.get('referer') || null,
  });

await logEvent({
  eventType: 'funnel_step',
  funnelStep: 'product',
  page: req.originalUrl,
  referrer: req.get('referer') || null,
});


  const slugAndId = String(req.params.slugAndId || '').trim();
  const m = slugAndId.match(new RegExp(`-(${UUID_RE.source})$`, 'i'));
  if (!m) return next();

  const id = m[1];
  const base = getBaseUrl(req);

  const { rows } = await pool.query(
    `
    SELECT
      id, name, description, image_url,
      seo_title, seo_description, long_description,
      created_at
    FROM products
    WHERE id = $1 AND active = true
    LIMIT 1
    `,
    [id]
  );

  if (!rows.length) return res.status(404).send('Not found');

  const p = rows[0];
  const slug = slugify(p.name || 'produit');
  const canonical = `${base}/p/${slug}-${p.id}`;

  let html = readTemplate('product');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', env.NODE_ENV === 'production' ? 'public, max-age=120' : 'no-store');
  res.send(html);
}));

/**
 * SSR: SHOP PAGE
 * GET /shop.html
 */
router.get('/shop.html', asyncHandler(async (req, res) => {
  await logEvent({
    eventType: 'page_view',
    page: req.originalUrl,
    referrer: req.get('referer') || null,
  });

  await logEvent({
    eventType: 'funnel_step',
    funnelStep: 'shop',
    page: req.originalUrl,
    referrer: req.get('referer') || null,
  });

  let html = readTemplate('shop');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', env.NODE_ENV === 'production' ? 'public, max-age=120' : 'no-store');
  res.send(html);
}));

module.exports = router;
