const express = require('express');
const router = express.Router();
const { pool } = require('../utils/db');

function getCart(req) {
  if (!req.session.cart) {
    req.session.cart = { items: [], total_xpf: 0 };
  }
  return req.session.cart;
}

function recalc(cart) {
  cart.total_xpf = cart.items.reduce(
    (sum, item) => sum + item.price_xpf * item.quantity,
    0
  );
}

function withCloudinaryTransform(url, transform) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;

  const parts = url.split('/image/upload/');
  if (parts.length !== 2) return url;

  const after = parts[1];
  const firstSegment = after.split('/')[0] || '';
  const looksLikeTransform =
    firstSegment.includes('w_') ||
    firstSegment.includes('h_') ||
    firstSegment.includes('c_') ||
    firstSegment.includes('q_') ||
    firstSegment.includes('f_') ||
    firstSegment.includes('g_');

  // si déjà transformée, on ne touche pas
  if (looksLikeTransform) return url;

  return `${parts[0]}/image/upload/${transform}/${after}`;
}

// ✅ taille panier
const TRANSFORM_CART = 'c_fill,w_140,h_140,q_auto,f_auto';

/**
 * GET /api/cart
 */
router.get('/', (req, res) => {
  const cart = getCart(req);
  res.json(cart);
});

/**
 * POST /api/cart/add
 * Recommandé : { variant_id, quantity }
 * Compat :     { product_id, quantity } => mappe vers la variante par défaut
 */
router.post('/add', async (req, res, next) => {
  try {
    const { variant_id, product_id, quantity = 1 } = req.body;

    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) {
      return res.status(400).json({ error: 'Quantité invalide' });
    }

    if (!variant_id && !product_id) {
      return res.status(400).json({ error: 'variant_id ou product_id requis' });
    }

    const sqlByVariant = `
      SELECT
        pv.id AS variant_id,
        pv.label AS variant_label,
        pv.price_xpf,
        pv.stripe_price_id,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        p.id AS product_id,
        p.name AS product_name
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1
        AND pv.active = true
        AND p.active = true
      LIMIT 1
    `;

    const sqlByProductDefault = `
      SELECT
        pv.id AS variant_id,
        pv.label AS variant_label,
        pv.price_xpf,
        pv.stripe_price_id,
        COALESCE(pv.image_url, p.image_url) AS image_url,
        p.id AS product_id,
        p.name AS product_name
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.id = $1
        AND p.active = true
        AND pv.active = true
        AND pv.is_default = true
      LIMIT 1
    `;

    const result = variant_id
      ? await pool.query(sqlByVariant, [variant_id])
      : await pool.query(sqlByProductDefault, [product_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Variante/Produit introuvable ou inactif' });
    }

    const v = result.rows[0];
    const cart = getCart(req);

    const existing = cart.items.find(i => i.variant_id === v.variant_id);

    // ✅ image panier (140x140) stockée en session
    const cartImageUrl = withCloudinaryTransform(v.image_url, TRANSFORM_CART);

    if (existing) {
      existing.quantity += q;
      // au cas où image_url était vide avant
      if (!existing.image_url && cartImageUrl) existing.image_url = cartImageUrl;
    } else {
      cart.items.push({
        variant_id: v.variant_id,
        variant_label: v.variant_label,
        product_id: v.product_id,
        name: v.product_name,
        price_xpf: v.price_xpf,
        stripe_price_id: v.stripe_price_id,
        image_url: cartImageUrl,
        quantity: q
      });
    }

    recalc(cart);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cart/update
 * { variant_id, quantity }
 */
router.post('/update', (req, res) => {
  const { variant_id, quantity } = req.body;

  if (!variant_id) {
    return res.status(400).json({ error: 'variant_id requis' });
  }

  const q = Number(quantity);
  if (!Number.isInteger(q) || q <= 0) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  const cart = getCart(req);

  const item = cart.items.find(i => i.variant_id === variant_id);
  if (!item) {
    return res.status(404).json({ error: 'Variante non trouvée dans le panier' });
  }

  item.quantity = q;
  recalc(cart);

  res.json(cart);
});

/**
 * POST /api/cart/remove
 * { variant_id }
 */
router.post('/remove', (req, res) => {
  const { variant_id } = req.body;

  if (!variant_id) {
    return res.status(400).json({ error: 'variant_id requis' });
  }

  const cart = getCart(req);

  cart.items = cart.items.filter(i => i.variant_id !== variant_id);
  recalc(cart);

  res.json(cart);
});

/**
 * POST /api/cart/clear
 */
router.post('/clear', (req, res) => {
  req.session.cart = { items: [], total_xpf: 0 };
  res.json({ success: true });
});

module.exports = router;
