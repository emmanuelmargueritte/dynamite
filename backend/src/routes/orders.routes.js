const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');

const router = express.Router();

/**
 * GET /api/orders/by-session/:stripeSessionId
 * Utilisé par success.js (session_id = cs_...)
 */
router.get('/by-session/:stripeSessionId', asyncHandler(async (req, res) => {
  const { stripeSessionId } = req.params;

  const orderRes = await pool.query(
    `
    SELECT
      id,
      session_id,
      amount_xpf,
      status,
      stripe_session_id,
      stripe_payment_intent_id,
      created_at
    FROM orders
    WHERE stripe_session_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [stripeSessionId]
  );

  if (!orderRes.rows.length) {
    return res.json({ status: 'not_found' });
  }

  const order = orderRes.rows[0];

  const itemsRes = await pool.query(
    `
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.unit_price_xpf,
      oi.total_xpf,
      p.name AS product_name,
      pv.label AS variant_label,
      COALESCE(pv.image_url, p.image_url) AS image_url
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = $1
    ORDER BY p.name ASC, pv.label ASC
    `,
    [order.id]
  );

  res.json({
    status: 'ok',
    order: {
      ...order,
      items: itemsRes.rows
    }
  });
}));

module.exports = router;
