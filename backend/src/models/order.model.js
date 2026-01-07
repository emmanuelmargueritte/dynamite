const { pool } = require('../utils/db');

module.exports = {
  async createPending({ user_id, status, total_xpf, delivery_method, delivery_fee_xpf, items }) {
    return await pool.connect().then(async (client) => {
      try {
        await client.query('BEGIN');

        const { rows: orderRows } = await client.query(
          `INSERT INTO orders (user_id, status, total_xpf, delivery_method, delivery_fee_xpf)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [user_id, status, total_xpf, delivery_method, delivery_fee_xpf]
        );

        const order = orderRows[0];

        for (const it of items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price_xpf)
             VALUES ($1,$2,$3,$4,$5)`,
            [order.id, it.product_id, it.variant_id, it.quantity, it.unit_price_xpf]
          );
        }

        await client.query('COMMIT');
        return order;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  },

  async attachStripeSession(orderId, stripeSessionId) {
    await pool.query(`UPDATE orders SET stripe_session_id=$2 WHERE id=$1`, [orderId, stripeSessionId]);
  },

  async getByIdWithItems(orderId) {
    const { rows } = await pool.query(
      `
      SELECT o.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'variant_id', oi.variant_id,
            'quantity', oi.quantity,
            'unit_price_xpf', oi.unit_price_xpf
          ) ORDER BY oi.id ASC)
           FROM order_items oi WHERE oi.order_id = o.id),
          '[]'::json
        ) AS items
      FROM orders o
      WHERE o.id = $1
      `,
      [orderId]
    );
    return rows[0] || null;
  },

  async setStatus(orderId, status) {
    await pool.query(`UPDATE orders SET status=$2 WHERE id=$1`, [orderId, status]);
  },

  async setInvoiceNumber(orderId, invoiceNumber) {
    await pool.query(`UPDATE orders SET invoice_number=$2 WHERE id=$1`, [orderId, invoiceNumber]);
  },

  async findByStripeSessionId(stripeSessionId) {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE stripe_session_id=$1`, [stripeSessionId]);
    return rows[0] || null;
  }
};
