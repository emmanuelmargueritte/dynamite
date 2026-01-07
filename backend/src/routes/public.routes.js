// backend/src/routes/public.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');

const router = express.Router();

function normalizeCloudinary(url, transform) {
  if (!url) return url;
  const marker = '/image/upload/';
  if (!url.includes(marker)) return url;

  const [base, tail] = url.split(marker);
  if (!tail) return url;

  const parts = tail.split('/');

  if (parts[0]?.startsWith('v')) {
    return `${base}${marker}${transform}/${tail}`;
  }

  parts[0] = transform;
  return `${base}${marker}${parts.join('/')}`;
}

// Boutique: 3/4 => 320x426, pas de rognage, fond blanc, auto format/qualité
const TRANSFORM_SHOP = 'c_pad,g_center,w_320,h_426,b_rgb:ffffff,q_auto,f_auto';

function normalizeVariantImage(v) {
  if (!v) return v;
  return {
    ...v,
    image_url: normalizeCloudinary(v.image_url, TRANSFORM_SHOP)
  };
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  // pg peut renvoyer json/jsonb en string selon config → tente parse
  if (typeof x === 'string') {
    try {
      const parsed = JSON.parse(x);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * 🔓 Catégories publiques (actives)
 * GET /api/public/categories
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT id, name, slug, sort_order
    FROM categories
    WHERE active = true
    ORDER BY sort_order ASC, name ASC
    `
  );

  res.json({ status: 'ok', categories: rows });
}));

/**
 * 🔓 Featured (Sélection du moment)
 * GET /api/public/featured
 * - retourne uniquement les produits active + is_featured=true
 * - tri: featured_rank ASC NULLS LAST, puis created_at DESC
 * - limit optionnel via ?limit=12
 */
router.get('/featured', asyncHandler(async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 60 ? limitRaw : 12;

  const { rows } = await pool.query(
    `
    WITH active_products AS (
      SELECT
        id,
        name,
        description,
        image_url,
        created_at,

        seo_title,
        seo_description,
        long_description,
        bullet_points::jsonb AS bullet_points,

        is_featured,
        featured_rank
      FROM products
      WHERE active = true
        AND is_featured = true
    ),
    variants AS (
      SELECT
        p.id AS product_id,
        pv.id,
        pv.label,
        pv.size,
        pv.color,
        pv.gender,
        pv.price_xpf,
        pv.stripe_price_id,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        pv.is_default
      FROM active_products p
      JOIN product_variants pv
        ON pv.product_id = p.id
       AND pv.active = true
    ),
    default_variant AS (
      SELECT DISTINCT ON (product_id)
        product_id,
        id AS default_variant_id,
        label AS default_variant_label,
        price_xpf,
        stripe_price_id,
        image_url
      FROM variants
      ORDER BY product_id, is_default DESC, id ASC
    )
    SELECT
      p.id,
      p.name,
      p.description,

      p.seo_title,
      p.seo_description,
      p.long_description,
      p.bullet_points,

      p.is_featured,
      p.featured_rank,

      dv.default_variant_id,
      dv.default_variant_label,
      dv.price_xpf,
      dv.stripe_price_id,
      dv.image_url,

      p.image_url AS product_image_url,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'size', v.size,
            'color', v.color,
            'gender', v.gender,
            'price_xpf', v.price_xpf,
            'stripe_price_id', v.stripe_price_id,
            'image_url', v.image_url,
            'is_default', v.is_default
          )
          ORDER BY v.is_default DESC, v.gender, v.color, v.size
        )
        FROM variants v
        WHERE v.product_id = p.id
      ), '[]'::jsonb) AS variants,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug
          )
          ORDER BY c.sort_order ASC, c.name ASC
        )
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
          AND c.active = true
      ), '[]'::jsonb) AS categories

    FROM active_products p
    JOIN default_variant dv ON dv.product_id = p.id
    ORDER BY p.featured_rank ASC NULLS LAST, p.created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  const products = rows.map(p => {
    const variants = asArray(p.variants).map(normalizeVariantImage);
    const categories = asArray(p.categories);

    return {
      ...p,
      categories,
      variants,
      image_url: normalizeCloudinary(p.image_url || p.product_image_url, TRANSFORM_SHOP),
      product_image_url: normalizeCloudinary(p.product_image_url, TRANSFORM_SHOP)
    };
  });

  res.json({ status: 'ok', products });
}));

/**
 * 🔓 Produits publics + variantes + catégories
 * GET /api/public/products
 */
router.get('/products', asyncHandler(async (req, res) => {
  // ✅ FIX: évite les 304 et les listes “figées” côté boutique
  res.set('Cache-Control', 'no-store');

  const { rows } = await pool.query(
    `
    WITH active_products AS (
      SELECT
        id,
        name,
        description,
        image_url,
        created_at,

        seo_title,
        seo_description,
        long_description,
        bullet_points::jsonb AS bullet_points,

        -- ✅ NEW : featured pour la home
        is_featured,
        featured_rank
      FROM products
      WHERE active = true
    ),
    variants AS (
      SELECT
        p.id AS product_id,
        pv.id,
        pv.label,
        pv.size,
        pv.color,
        pv.gender,
        pv.price_xpf,
        pv.stripe_price_id,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        pv.is_default
      FROM active_products p
      JOIN product_variants pv
        ON pv.product_id = p.id
       AND pv.active = true
    ),
    default_variant AS (
      SELECT DISTINCT ON (product_id)
        product_id,
        id AS default_variant_id,
        label AS default_variant_label,
        price_xpf,
        stripe_price_id,
        image_url
      FROM variants
      ORDER BY product_id, is_default DESC, id ASC
    )
    SELECT
      p.id,
      p.name,
      p.description,

      p.seo_title,
      p.seo_description,
      p.long_description,
      p.bullet_points,

      -- ✅ NEW : renvoyé au front
      p.is_featured,
      p.featured_rank,

      dv.default_variant_id,
      dv.default_variant_label,
      dv.price_xpf,
      dv.stripe_price_id,
      dv.image_url,

      p.image_url AS product_image_url,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'size', v.size,
            'color', v.color,
            'gender', v.gender,
            'price_xpf', v.price_xpf,
            'stripe_price_id', v.stripe_price_id,
            'image_url', v.image_url,
            'is_default', v.is_default
          )
          ORDER BY v.is_default DESC, v.gender, v.color, v.size
        )
        FROM variants v
        WHERE v.product_id = p.id
      ), '[]'::jsonb) AS variants,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug
          )
          ORDER BY c.sort_order ASC, c.name ASC
        )
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
          AND c.active = true
      ), '[]'::jsonb) AS categories

    FROM active_products p
    JOIN default_variant dv ON dv.product_id = p.id
    ORDER BY p.created_at DESC
    `
  );

  const products = rows.map(p => {
    const variants = asArray(p.variants).map(normalizeVariantImage);
    const categories = asArray(p.categories);

    return {
      ...p,
      categories,                 // ✅ toujours présent
      variants,                   // ✅ toujours présent
      // on normalise les images utiles
      image_url: normalizeCloudinary(p.image_url || p.product_image_url, TRANSFORM_SHOP),
      product_image_url: normalizeCloudinary(p.product_image_url, TRANSFORM_SHOP)
    };
  });

  res.json({ status: 'ok', products });
}));

/**
 * 🔓 Détail produit public + variantes + catégories
 * GET /api/public/products/:id
 */
router.get('/products/:id', asyncHandler(async (req, res) => {
  // ✅ FIX: évite le cache “figé” sur les fiches produit
  res.set('Cache-Control', 'no-store');

  const { id } = req.params;

  const { rows } = await pool.query(
    `
    WITH p AS (
      SELECT
        id,
        name,
        description,
        image_url,

        seo_title,
        seo_description,
        long_description,
        bullet_points::jsonb AS bullet_points,

        -- ✅ NEW : cohérence avec /products
        is_featured,
        featured_rank
      FROM products
      WHERE id = $1 AND active = true
      LIMIT 1
    ),
    variants AS (
      SELECT
        p.id AS product_id,
        pv.id,
        pv.label,
        pv.size,
        pv.color,
        pv.gender,
        pv.price_xpf,
        pv.stripe_price_id,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        pv.is_default
      FROM p
      JOIN product_variants pv
        ON pv.product_id = p.id
       AND pv.active = true
    ),
    default_variant AS (
      SELECT DISTINCT ON (product_id)
        product_id,
        id AS default_variant_id,
        label AS default_variant_label,
        price_xpf,
        stripe_price_id,
        image_url
      FROM variants
      ORDER BY product_id, is_default DESC, id ASC
    )
    SELECT
      p.id,
      p.name,
      p.description,

      p.seo_title,
      p.seo_description,
      p.long_description,
      p.bullet_points,

      -- ✅ NEW : renvoyé au front
      p.is_featured,
      p.featured_rank,

      dv.default_variant_id,
      dv.default_variant_label,
      dv.price_xpf,
      dv.stripe_price_id,
      dv.image_url,

      p.image_url AS product_image_url,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'label', v.label,
            'size', v.size,
            'color', v.color,
            'gender', v.gender,
            'price_xpf', v.price_xpf,
            'stripe_price_id', v.stripe_price_id,
            'image_url', v.image_url,
            'is_default', v.is_default
          )
          ORDER BY v.is_default DESC, v.gender, v.color, v.size
        )
        FROM variants v
        WHERE v.product_id = p.id
      ), '[]'::jsonb) AS variants,

      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug
          )
          ORDER BY c.sort_order ASC, c.name ASC
        )
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
          AND c.active = true
      ), '[]'::jsonb) AS categories

    FROM p
    JOIN default_variant dv ON dv.product_id = p.id
    `,
    [id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Produit introuvable' });
  }

  const p = rows[0];
  const variants = asArray(p.variants).map(normalizeVariantImage);
  const categories = asArray(p.categories);

  const product = {
    ...p,
    categories, // ✅ toujours présent
    variants,   // ✅ toujours présent
    image_url: normalizeCloudinary(p.image_url || p.product_image_url, TRANSFORM_SHOP),
    product_image_url: normalizeCloudinary(p.product_image_url, TRANSFORM_SHOP)
  };

  res.json({ status: 'ok', product });
}));

router.get('/store', asyncHandler(async (req, res) => {
  res.json({
    status: 'ok',
    name: 'Dynamite',
    currency: 'XPF'
  });
}));

module.exports = router;
