const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');

const router = express.Router();

/**
 * 🔒 Admin — Liste des commandes (lecture seule)
 * GET /api/admin/orders
 * Query:
 * - limit, offset
 * - status=paid|pending
 * - q=search (order id OR session_id/stripe ids)
 * - sort=created_at|amount_xpf
 * - dir=asc|desc
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const status = req.query.status ? String(req.query.status) : null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const allowedSort = new Set(['created_at', 'amount_xpf']);
    const sort = allowedSort.has(String(req.query.sort)) ? String(req.query.sort) : 'created_at';
    const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const whereParts = [];
    const params = [];

    if (status) {
      params.push(status);
      whereParts.push(`o.status = $${params.length}`);
    }

    if (q) {
      const asInt = Number(q);
      if (Number.isInteger(asInt) && String(asInt) === q) {
        params.push(asInt);
        whereParts.push(`o.id = $${params.length}`);
      } else {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        whereParts.push(
          `(o.session_id ILIKE ${p} OR o.stripe_session_id ILIKE ${p} OR o.stripe_payment_intent_id ILIKE ${p})`
        );
      }
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    // pagination robuste : limit+1 -> has_more
    params.push(limit + 1, offset);

    const { rows } = await pool.query(
      `
      SELECT
        o.id,
        o.session_id,
        o.status,
        o.amount_xpf,
        o.created_at,
        o.stripe_session_id,
        o.stripe_payment_intent_id,
        COUNT(oi.*)::int AS items_count,
        COALESCE(SUM(oi.quantity), 0)::int AS total_qty
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${whereSql}
      GROUP BY o.id
      ORDER BY ${sort} ${dir}
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const has_more = rows.length > limit;
    const orders = has_more ? rows.slice(0, limit) : rows;

    res.json({
      status: 'ok',
      orders,
      meta: {
        limit,
        offset,
        has_more,
        sort,
        dir,
        filters: { status, q }
      }
    });
  })
);

/**
 * 🔒 Admin — Suggestions pour la recherche
 * GET /api/admin/orders/suggest?q=...
 */
router.get(
  '/suggest',
  asyncHandler(async (req, res) => {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q || q.length < 2) {
      return res.json({ status: 'ok', suggestions: [] });
    }

    const asInt = Number(q);
    const isInt = Number.isInteger(asInt) && String(asInt) === q;

    const params = [];
    const parts = [];

    if (isInt) {
      params.push(asInt);
      parts.push(`
        SELECT o.id::text AS s
        FROM orders o
        WHERE o.id = $${params.length}
        LIMIT 5
      `);
    }

    params.push(`%${q}%`);
    const p = `$${params.length}`;

    parts.push(`
      SELECT o.session_id AS s
      FROM orders o
      WHERE o.session_id ILIKE ${p}
        AND o.session_id IS NOT NULL
      LIMIT 5
    `);

    parts.push(`
      SELECT o.stripe_payment_intent_id AS s
      FROM orders o
      WHERE o.stripe_payment_intent_id ILIKE ${p}
        AND o.stripe_payment_intent_id IS NOT NULL
      LIMIT 5
    `);

    parts.push(`
      SELECT o.stripe_session_id AS s
      FROM orders o
      WHERE o.stripe_session_id ILIKE ${p}
        AND o.stripe_session_id IS NOT NULL
      LIMIT 5
    `);

    const { rows } = await pool.query(
      `
      SELECT DISTINCT s
      FROM (
        ${parts.join('\nUNION ALL\n')}
      ) t
      WHERE s IS NOT NULL AND s <> ''
      LIMIT 8
      `,
      params
    );

    res.json({ status: 'ok', suggestions: rows.map(r => r.s) });
  })
);

/**
 * 🔒 Admin — Export CSV (lecture seule)
 * GET /api/admin/orders/export.csv?status=paid&q=...
 */
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const whereParts = [];
    const params = [];

    if (status) {
      params.push(status);
      whereParts.push(`o.status = $${params.length}`);
    }

    if (q) {
      const asInt = Number(q);
      if (Number.isInteger(asInt) && String(asInt) === q) {
        params.push(asInt);
        whereParts.push(`o.id = $${params.length}`);
      } else {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        whereParts.push(
          `(o.session_id ILIKE ${p} OR o.stripe_session_id ILIKE ${p} OR o.stripe_payment_intent_id ILIKE ${p})`
        );
      }
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `
      SELECT
        o.id,
        o.created_at,
        o.status,
        o.amount_xpf,
        o.session_id,
        o.stripe_session_id,
        o.stripe_payment_intent_id,
        COUNT(oi.*)::int AS items_count,
        COALESCE(SUM(oi.quantity), 0)::int AS total_qty
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${whereSql}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 5000
      `,
      params
    );

    const header = [
      'id',
      'created_at',
      'status',
      'amount_xpf',
      'items_count',
      'total_qty',
      'session_id',
      'stripe_session_id',
      'stripe_payment_intent_id'
    ].join(',');

    const lines = rows.map(r =>
      [
        r.id,
        new Date(r.created_at).toISOString(),
        r.status,
        r.amount_xpf,
        r.items_count,
        r.total_qty,
        r.session_id || '',
        r.stripe_session_id || '',
        r.stripe_payment_intent_id || ''
      ]
        .map(v => `"${String(v).replaceAll('"', '""')}"`)
        .join(',')
    );

    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  })
);

/**
 * 🔒 Admin — Détail d’une commande (lecture seule)
 * GET /api/admin/orders/:orderId
 */
router.get(
  '/:orderId',
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const orderRes = await pool.query(
      `
      SELECT
        id,
        session_id,
        status,
        amount_xpf,
        created_at,
        stripe_session_id,
        stripe_payment_intent_id
      FROM orders
      WHERE id = $1
      `,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ status: 'error', error: 'Order not found' });
    }

    const itemsRes = await pool.query(
      `
      SELECT
        oi.product_id,
        oi.quantity,
        oi.unit_price_xpf,
        oi.total_xpf,
        p.name AS product_name,
        p.image_url,
        p.active
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.product_id ASC
      `,
      [orderId]
    );

    res.json({
      status: 'ok',
      order: orderRes.rows[0],
      items: itemsRes.rows
    });
  })
);

module.exports = router;
