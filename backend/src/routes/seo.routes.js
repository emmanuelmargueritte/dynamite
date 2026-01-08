// backend/src/routes/seo.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');
const { env } = require('../utils/env');

const fs = require('fs');
const path = require('path');

const router = express.Router();

function getBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  const base = (configured && String(configured).trim()) || `${req.protocol}://${req.get('host')}`;
  return base.replace(/\/+$/, '');
}

function xmlEscape(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isoDate(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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

// ✅ routes/ -> src/ -> backend/ -> project/
function frontendPath(rel) {
  return path.resolve(__dirname, '../../../frontend', rel);
}

function fileExists(rel) {
  try {
    return fs.existsSync(frontendPath(rel));
  } catch {
    return false;
  }
}

function fileMtimeDate(rel) {
  try {
    const stat = fs.statSync(frontendPath(rel));
    return isoDate(stat.mtime);
  } catch {
    return isoDate(new Date());
  }
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const cleanLoc = String(loc || '').trim().replace(/\s+/g, '');
  return `  <url>
    <loc>${xmlEscape(cleanLoc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;
}

const TRACKING_PARAMS = new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'gclid','fbclid','yclid','mc_cid','mc_eid','igshid','ref'
]);

function stripTrackingParams(urlObj) {
  let changed = false;
  for (const k of [...urlObj.searchParams.keys()]) {
    const kk = String(k).toLowerCase();
    if (TRACKING_PARAMS.has(kk) || kk.startsWith('utm_')) {
      urlObj.searchParams.delete(k);
      changed = true;
    }
  }
  return changed;
}

function isBot(req) {
  const ua = String(req.get('user-agent') || '').toLowerCase();
  return /(bot|crawl|spider|slurp|google|bing|yandex|duckduck|baidu|semrush|ahrefs|screaming frog)/i.test(ua);
}

/**
 * ✅ IMPORTANT
 * On NE sert PLUS product.html sur /p/<slug>-<uuid> ici.
 * Cette route appartient au SSR (ssr.routes.js).
 * Sinon, seoRoutes “mange” /p/* et le SSR ne s’exécute jamais.
 */

/**
 * GET /robots.txt
 */
router.get('/robots.txt', asyncHandler(async (req, res) => {
  const base = getBaseUrl(req);

  const lines = [
  'User-agent: *',
  'Disallow: /admin/',
  'Disallow: /api/',
  'Disallow: /cart',
  'Disallow: /checkout'
];


  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n') + '\n');
}));

/**
 * Redirect legacy product page:
 * /product.html?id=<uuid>&variant=<uuid?>
 * -> /p/<slug>-<uuid>?variant=<uuid?>
 */
router.get('/product.html', asyncHandler(async (req, res) => {
  const base = getBaseUrl(req);
  const url = new URL(`${base}${req.originalUrl}`);

  stripTrackingParams(url);

  const id = (req.query.id || '').toString().trim();
  const variant = (req.query.variant || '').toString().trim();

  if (!id) return res.redirect(301, '/shop.html');

  const { rows } = await pool.query(
    `SELECT id, name FROM products WHERE id = $1 LIMIT 1`,
    [id]
  );

  if (!rows.length) return res.redirect(301, '/shop.html');

  const slug = slugify(rows[0].name || 'produit');

  const to = new URL(`${base}/p/${encodeURIComponent(slug)}-${encodeURIComponent(id)}`);
  if (variant) to.searchParams.set('variant', variant);

  return res.redirect(301, to.pathname + to.search);
}));

/**
 * Canonical cleanup on shop:
 * - strips tracking params (humans + bots)
 * - for bots only: remove q + sort (keep cat)
 */
router.get('/shop.html', (req, res, next) => {
  const base = getBaseUrl(req);
  const url = new URL(`${base}${req.originalUrl}`);

  let changed = stripTrackingParams(url);

  if (isBot(req)) {
    if (url.searchParams.has('q')) { url.searchParams.delete('q'); changed = true; }
    if (url.searchParams.has('sort')) { url.searchParams.delete('sort'); changed = true; }
  }

  if (url.searchParams.get('cat') === 'all') {
    url.searchParams.delete('cat');
    changed = true;
  }

  if (changed) return res.redirect(301, url.pathname + (url.search ? url.search : ''));
  return next();
});

/**
 * GET /sitemap.xml
 */
router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const base = getBaseUrl(req);
  const today = isoDate(new Date());

  const catRes = await pool.query(
    `
    SELECT slug
    FROM categories
    WHERE active = true
    ORDER BY sort_order ASC, name ASC
    `
  );

  let prodRows = [];
  try {
    const prodRes = await pool.query(
      `
      SELECT id, name, COALESCE(updated_at, created_at) AS lastmod
      FROM products
      WHERE active = true
      ORDER BY created_at DESC
      `
    );
    prodRows = prodRes.rows || [];
  } catch {
    const prodRes = await pool.query(
      `
      SELECT id, name, created_at AS lastmod
      FROM products
      WHERE active = true
      ORDER BY created_at DESC
      `
    );
    prodRows = prodRes.rows || [];
  }

  const urls = [];

  urls.push({ loc: `${base}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' });
  urls.push({ loc: `${base}/shop.html`, lastmod: today, changefreq: 'daily', priority: '0.9' });

  const staticPages = [
    { file: 'cgv.html', freq: 'yearly', prio: '0.3' },
    { file: 'mentions-legales.html', freq: 'yearly', prio: '0.3' },
    { file: 'politique-confidentialite.html', freq: 'yearly', prio: '0.3' },
    { file: 'politique-cookies.html', freq: 'yearly', prio: '0.3' }
  ];

  for (const p of staticPages) {
    if (!fileExists(p.file)) continue;
    urls.push({
      loc: `${base}/${p.file}`,
      lastmod: fileMtimeDate(p.file),
      changefreq: p.freq,
      priority: p.prio
    });
  }

  for (const c of (catRes.rows || [])) {
    const slug = String(c.slug || '').trim().toLowerCase();
    if (!slug) continue;
    urls.push({
      loc: `${base}/shop.html?cat=${encodeURIComponent(slug)}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.8'
    });
  }

  for (const p of prodRows) {
    const id = String(p.id || '').trim();
    if (!id) continue;

    const slug = slugify(p.name || 'produit');
    const lastmod = isoDate(p.lastmod || today);

    urls.push({
      loc: `${base}/p/${encodeURIComponent(slug)}-${encodeURIComponent(id)}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.7'
    });
  }

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlEntry).join('\n')}
</urlset>
`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('X-Robots-Tag', 'noindex');
  res.set('Cache-Control', env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store');
  res.send(xml);
}));

module.exports = router;
