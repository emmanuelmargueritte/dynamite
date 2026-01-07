// backend/src/routes/ssr.routes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');
const { env } = require('../utils/env');

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

function setTagContent(html, tagName, attrName, attrValue, newContent) {
  const re = new RegExp(
    `<${tagName}([^>]*?)${attrName}=["']${attrValue}["']([^>]*?)>`,
    'i'
  );
  return html.replace(re, (m, a, b) => {
    if (/content\s*=\s*["']/.test(m)) {
      return m.replace(/content\s*=\s*["'][^"']*["']/i, `content="${escapeHtml(newContent)}"`);
    }
    return `<${tagName}${a}${attrName}="${attrValue}"${b} content="${escapeHtml(newContent)}">`;
  });
}

function setLinkHref(html, rel, href) {
  const re = new RegExp(`<link([^>]*?)rel=["']${rel}["']([^>]*?)>`, 'i');
  if (re.test(html)) {
    return html.replace(re, (m) => m.replace(/href\s*=\s*["'][^"']*["']/i, `href="${escapeHtml(href)}"`));
  }
  return html.replace(/<\/head>/i, `  <link rel="${rel}" href="${escapeHtml(href)}" />\n</head>`);
}

function setTitle(html, title) {
  if (/<title>.*<\/title>/i.test(html)) {
    return html.replace(/<title>.*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  }
  return html.replace(/<\/head>/i, `  <title>${escapeHtml(title)}</title>\n</head>`);
}

function injectBeforeHeadClose(html, chunk) {
  return html.replace(/<\/head>/i, `${chunk}\n</head>`);
}

function injectIntoArticle(html, articleId, chunk) {
  const re = new RegExp(`<article[^>]*id=["']${articleId}["'][^>]*>([\\s\\S]*?)<\\/article>`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, (m) => {
    return m.replace(/<article[^>]*>/i, (open) => `${open}\n${chunk}\n`);
  });
}

function setJsonLdPlaceholder(html, scriptId, jsonObj) {
  const re = new RegExp(`<script[^>]*id=["']${scriptId}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i');
  const json = JSON.stringify(jsonObj);
  if (re.test(html)) {
    return html.replace(re, `<script type="application/ld+json" id="${scriptId}">${escapeHtml(json)}</script>`);
  }
  return injectBeforeHeadClose(
    html,
    `  <script type="application/ld+json" id="${scriptId}">${escapeHtml(json)}</script>`
  );
}

function upsertMeta(html, attrs, content) {
  const key = attrs.name ? 'name' : 'property';
  const val = attrs.name || attrs.property;
  if (!val) return html;

  const re = new RegExp(`<meta([^>]*?)${key}=["']${val}["']([^>]*?)>`, 'i');
  if (re.test(html)) return setTagContent(html, 'meta', key, val, content);

  return injectBeforeHeadClose(
    html,
    `  <meta ${key}="${escapeHtml(val)}" content="${escapeHtml(content)}" />`
  );
}

function formatXpf(n) {
  const num = Number(n || 0);
  try {
    return `${num.toLocaleString('fr-FR')} XPF`;
  } catch {
    return `${num} XPF`;
  }
}

/**
 * SSR: PRODUCT PAGE
 * GET /p/<slug>-<uuid>
 */
router.get('/p/:slugAndId', asyncHandler(async (req, res, next) => {
  const slugAndId = String(req.params.slugAndId || '').trim();
  const m = slugAndId.match(new RegExp(`-(${UUID_RE.source})$`, 'i'));
  if (!m) return next();

  const id = m[1];
  const base = getBaseUrl(req);

  const { rows } = await pool.query(
    `
    WITH p AS (
      SELECT
        id, name, description, image_url,
        seo_title, seo_description, long_description,
        bullet_points::jsonb AS bullet_points,
        created_at AS lastmod
      FROM products
      WHERE id = $1 AND active = true
      LIMIT 1
    ),
    v AS (
      SELECT
        pv.product_id,
        pv.price_xpf,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        pv.is_default
      FROM product_variants pv
      JOIN p ON p.id = pv.product_id
      WHERE pv.active = true
    ),
    dv AS (
      SELECT DISTINCT ON (product_id)
        product_id,
        image_url AS hero_image
      FROM v
      ORDER BY product_id, is_default DESC
    ),
    mp AS (
      SELECT product_id, MIN(price_xpf) AS min_price
      FROM v
      GROUP BY product_id
    )
    SELECT
      p.*,
      COALESCE(dv.hero_image, p.image_url) AS hero_image,
      COALESCE(mp.min_price, 0) AS min_price,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', c.name, 'slug', c.slug) ORDER BY c.sort_order ASC, c.name ASC)
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id AND c.active = true
      ), '[]'::jsonb) AS categories
    FROM p
    LEFT JOIN dv ON dv.product_id = p.id
    LEFT JOIN mp ON mp.product_id = p.id
    `,
    [id]
  );

  if (!rows.length) return res.status(404).send('Not found');

  const p = rows[0];
  const slug = slugify(p.name || 'produit');
  const canonical = `${base}/p/${encodeURIComponent(slug)}-${encodeURIComponent(p.id)}`;

  const title = `${(p.seo_title || p.name || 'Produit').trim()} — Dynamite`;
  const desc = (p.seo_description || p.description || 'Détail produit Dynamite.').trim();

  const heroImg = normalizeCloudinary(p.hero_image, TRANSFORM_PDP_900);

  const bullets = Array.isArray(p.bullet_points) ? p.bullet_points : [];
  const cats = Array.isArray(p.categories) ? p.categories : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": (p.name || 'Produit').trim(),
    "description": desc,
    ...(heroImg ? { "image": [heroImg] } : {}),
    "brand": { "@type": "Brand", "name": "Dynamite" },
    ...(cats.length ? { "category": cats.map(c => c?.name).filter(Boolean).join(" / ") } : {}),
    "offers": {
      "@type": "Offer",
      "priceCurrency": "XPF",
      "price": String(Number(p.min_price || 0)),
      "availability": "https://schema.org/InStock",
      "url": canonical
    }
  };

  const ssrBody = `
    <div class="home-shell" style="width:min(1180px, calc(100% - 32px)); margin:0 auto;">
      <a class="small" href="/shop.html" style="display:inline-block;margin:10px 0;">← Retour boutique</a>

      <div class="card" style="overflow:hidden;">
        <div class="content">
          <div class="badge">Produit</div>
          <div class="title">${escapeHtml(p.name || 'Produit')}</div>
          <div class="meta">${escapeHtml(desc)}</div>

          <div class="row" style="gap:10px; align-items:center; margin-top:10px;">
            <span class="price">${escapeHtml(formatXpf(p.min_price || 0))}</span>
            <a class="btn" href="/shop.html" style="margin-left:auto;">Voir la boutique</a>
          </div>

          ${heroImg ? `<div style="margin-top:14px; background:#f6f6f6; border-radius:14px; overflow:hidden;">
            <img src="${escapeHtml(heroImg)}" alt="${escapeHtml(p.name || '')}" style="width:100%; height:auto; display:block;" />
          </div>` : ''}

          ${p.long_description ? `<div class="meta" style="margin-top:12px; white-space:pre-line;">${escapeHtml(p.long_description)}</div>` : ''}

          ${Array.isArray(bullets) && bullets.length ? `
            <ul style="margin:12px 0 0; padding-left:18px; color: var(--muted); line-height:1.45;">
              ${bullets.slice(0, 10).map(b => `<li>${escapeHtml(String(b))}</li>`).join('')}
            </ul>
          ` : ''}

          <noscript>
            <p class="small" style="margin-top:10px;">
              Active JavaScript pour choisir la variante et ajouter au panier.
            </p>
          </noscript>
        </div>
      </div>
    </div>
  `.trim();

  let html = readTemplate('product');

  html = setTitle(html, title);
  html = setTagContent(html, 'meta', 'name', 'description', desc);
  html = setLinkHref(html, 'canonical', canonical);

  html = upsertMeta(html, { property: 'og:type' }, 'product');
  html = upsertMeta(html, { property: 'og:site_name' }, 'Dynamite');
  html = upsertMeta(html, { property: 'og:title' }, title);
  html = upsertMeta(html, { property: 'og:description' }, desc);
  html = upsertMeta(html, { property: 'og:url' }, canonical);
  if (heroImg) html = upsertMeta(html, { property: 'og:image' }, heroImg);

  html = upsertMeta(html, { name: 'twitter:card' }, heroImg ? 'summary_large_image' : 'summary');
  html = upsertMeta(html, { name: 'twitter:title' }, title);
  html = upsertMeta(html, { name: 'twitter:description' }, desc);
  if (heroImg) html = upsertMeta(html, { name: 'twitter:image' }, heroImg);

  html = setJsonLdPlaceholder(html, 'pdp-jsonld', jsonLd);
  html = injectIntoArticle(html, 'product', ssrBody);

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', env.NODE_ENV === 'production' ? 'public, max-age=120' : 'no-store');
  res.send(html);
}));

/**
 * SSR: SHOP PAGE
 * GET /shop.html (optionnel cat)
 */
router.get('/shop.html', asyncHandler(async (req, res) => {
  const base = getBaseUrl(req);
  const cat = String(req.query.cat || '').trim().toLowerCase();

  const pageTitle = cat && cat !== 'all'
    ? `Boutique — ${cat} — Dynamite`
    : `Boutique — Dynamite`;

  const pageDesc = cat && cat !== 'all'
    ? `Découvrez nos produits dans la catégorie ${cat}. Livraison et paiement sécurisé.`
    : `Découvrez tous les vêtements Dynamite disponibles en ligne.`;

  const canonical = cat && cat !== 'all'
    ? `${base}/shop.html?cat=${encodeURIComponent(cat)}`
    : `${base}/shop.html`;

  const { rows: products } = await pool.query(
    `
    WITH active_products AS (
      SELECT
        p.id,
        p.name,
        p.description,
        p.image_url,
        p.seo_description,
        p.created_at
      FROM products p
      WHERE p.active = true
      ${cat && cat !== 'all' ? `
        AND EXISTS (
          SELECT 1
          FROM product_categories pc
          JOIN categories c ON c.id = pc.category_id
          WHERE pc.product_id = p.id AND c.active = true AND c.slug = $1
        )
      ` : ''}
    ),
    variants AS (
      SELECT
        ap.id AS product_id,
        pv.price_xpf,
        COALESCE(pv.image_url, ap.image_url) AS image_url,
        pv.is_default
      FROM active_products ap
      JOIN product_variants pv
        ON pv.product_id = ap.id
       AND pv.active = true
    ),
    dv AS (
      SELECT DISTINCT ON (product_id)
        product_id,
        image_url AS card_image
      FROM variants
      ORDER BY product_id, is_default DESC
    ),
    mp AS (
      SELECT product_id, MIN(price_xpf) AS min_price
      FROM variants
      GROUP BY product_id
    )
    SELECT
      ap.*,
      COALESCE(dv.card_image, ap.image_url) AS card_image,
      COALESCE(mp.min_price, 0) AS min_price
    FROM active_products ap
    LEFT JOIN dv ON dv.product_id = ap.id
    LEFT JOIN mp ON mp.product_id = ap.id
    ORDER BY ap.created_at DESC
    LIMIT 24
    `,
    cat && cat !== 'all' ? [cat] : []
  );

  const cardsHtml = (products || []).map(p => {
    const slug = slugify(p.name || 'produit');
    const url = `/p/${encodeURIComponent(slug)}-${encodeURIComponent(p.id)}`;
    const img = normalizeCloudinary(p.card_image, TRANSFORM_SHOP);
    const desc = String(p.seo_description || p.description || '').trim().slice(0, 140);

    return `
      <article class="card">
        <a class="media" href="${url}" style="background:#f6f6f6;">
          ${img ? `<img class="product-image" src="${escapeHtml(img)}" alt="${escapeHtml(p.name || '')}" loading="lazy" />` : ''}
        </a>
        <div class="content">
          <a class="title" href="${url}">${escapeHtml(p.name || 'Produit')}</a>
          <div class="meta">${desc ? escapeHtml(desc) : '&nbsp;'}</div>
          <div class="row" style="gap:10px; align-items:center; margin-top:10px;">
            <span class="price">${escapeHtml(formatXpf(p.min_price || 0))}</span>
            <a class="btn" href="${url}" style="margin-left:auto;">Voir</a>
          </div>
        </div>
      </article>
    `.trim();
  }).join('\n');

  const itemList = (products || []).map((p, i) => {
    const slug = slugify(p.name || 'produit');
    const url = `${base}/p/${encodeURIComponent(slug)}-${encodeURIComponent(p.id)}`;
    return {
      "@type": "ListItem",
      "position": i + 1,
      "url": url,
      "name": p.name || 'Produit'
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        "name": pageTitle,
        "description": pageDesc
      },
      {
        "@type": "ItemList",
        "name": "Produits",
        "itemListElement": itemList
      }
    ]
  };

  let html = readTemplate('shop');

  html = setTitle(html, pageTitle);
  html = setTagContent(html, 'meta', 'name', 'description', pageDesc);
  html = setLinkHref(html, 'canonical', canonical);

  html = upsertMeta(html, { property: 'og:type' }, 'website');
  html = upsertMeta(html, { property: 'og:site_name' }, 'Dynamite');
  html = upsertMeta(html, { property: 'og:title' }, pageTitle);
  html = upsertMeta(html, { property: 'og:description' }, pageDesc);
  html = upsertMeta(html, { property: 'og:url' }, canonical);

  html = upsertMeta(html, { name: 'twitter:card' }, 'summary');
  html = upsertMeta(html, { name: 'twitter:title' }, pageTitle);
  html = upsertMeta(html, { name: 'twitter:description' }, pageDesc);

  html = setJsonLdPlaceholder(html, 'shop-jsonld', jsonLd);

  html = html.replace(
    /<div\s+id=["']products["'][^>]*>([\s\S]*?)<\/div>/i,
    (m) => m.replace(/<\/div>/i, `\n${cardsHtml}\n</div>`)
  );

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', env.NODE_ENV === 'production' ? 'public, max-age=120' : 'no-store');
  res.send(html);
}));

module.exports = router;
