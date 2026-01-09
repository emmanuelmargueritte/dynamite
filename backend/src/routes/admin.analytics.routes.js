const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');

const router = express.Router();

/**
 * GET /api/admin/analytics
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
      const result = {};

      // 1️⃣ Pages vues
      const pagesRes = await client.query(`
        SELECT page, COUNT(*) AS views
        FROM analytics_events
        WHERE event_type = 'page_view'
        GROUP BY page
        ORDER BY views DESC
        LIMIT 20
      `);
      result.pages = pagesRes.rows;

      // 2️⃣ Tunnel
      const funnelRes = await client.query(`
        SELECT funnel_step, COUNT(*) AS count
        FROM analytics_events
        WHERE event_type = 'funnel_step'
        GROUP BY funnel_step
      `);
      result.funnel = funnelRes.rows;

      // 3️⃣ Commandes
      const ordersRes = await client.query(`
        SELECT COUNT(*) AS orders
        FROM analytics_events
        WHERE event_type = 'order'
      `);
      result.orders = Number(ordersRes.rows[0].orders || 0);

      // 4️⃣ Conversion checkout → commande
      const conversionRes = await client.query(`
        SELECT
          ROUND(
            100.0 *
            COUNT(*) FILTER (WHERE event_type = 'order')
            /
            NULLIF(COUNT(*) FILTER (
              WHERE event_type = 'funnel_step'
              AND funnel_step = 'checkout'
            ), 0),
            2
          ) AS conversion
        FROM analytics_events
      `);
      result.conversion_checkout_pct = conversionRes.rows[0].conversion;

      // 5️⃣ CA & panier moyen
      const revenueRes = await client.query(`
        SELECT
          COALESCE(SUM(amount_xpf), 0) AS ca_total,
          COUNT(*) AS orders_total,

          COALESCE(SUM(amount_xpf) FILTER (
            WHERE created_at >= date_trunc('month', NOW())
          ), 0) AS ca_month,

          COALESCE(SUM(amount_xpf) FILTER (
            WHERE created_at >= NOW() - INTERVAL '7 days'
          ), 0) AS ca_7d
        FROM orders
        WHERE status = 'paid'
      `);

      const r = revenueRes.rows[0];
      result.revenue = {
        ca_total: Number(r.ca_total),
        ca_month: Number(r.ca_month),
        ca_7d: Number(r.ca_7d),
        panier_moyen:
          r.orders_total > 0
            ? Math.round(r.ca_total / r.orders_total)
            : 0
      };

      // 6️⃣ Top produits (par CA)
      const topProductsRes = await client.query(`
        SELECT
          p.name,
          SUM(oi.quantity) AS quantity,
          SUM(oi.total_xpf) AS ca
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.status = 'paid'
        GROUP BY p.id, p.name
        ORDER BY ca DESC
        LIMIT 5
      `);

      result.top_products = topProductsRes.rows.map(r => ({
        name: r.name,
        quantity: Number(r.quantity),
        ca: Number(r.ca)
      }));

      res.json(result);
    } finally {
      client.release();
    }
  })
);

module.exports = router;
