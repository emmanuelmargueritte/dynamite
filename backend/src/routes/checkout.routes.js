const express = require('express');
const Stripe = require('stripe');

const { env } = require('../utils/env');
const { pool } = require('../utils/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../errors/AppError');
const logEvent = require('../analytics/logEvent');

const router = express.Router();

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

const CHECKOUT_LOCK_MS = 5000;

/* =========================
   STRIPE SESSION CREATION
========================= */

function isRecurringPriceInPaymentModeError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('payment` mode but passed a recurring price') ||
    msg.includes('switch to `subscription` mode') ||
    msg.toLowerCase().includes('recurring price')
  );
}

async function createStripeSessionSafe(params) {
  try {
    return await stripe.checkout.sessions.create(params);
  } catch (err) {
    if (isRecurringPriceInPaymentModeError(err)) {
      throw new AppError(
        'CHECKOUT_PRODUCT_MISCONFIG',
        400,
        'Produit mal configuré côté paiement'
      );
    }
    throw err;
  }
}

/* =========================
   CREATE CHECKOUT SESSION
========================= */

router.post(
  '/create-session',
  asyncHandler(async (req, res) => {
    const sessionId = req.sessionID;
    const cart = req.session.cart;

    if (!sessionId) throw new AppError('SESSION_MISSING', 400);
    if (!cart?.items?.length) throw new AppError('CART_EMPTY', 400);

    const now = Date.now();
    const lockAt = req.session.checkout_lock_at || 0;
    const lastStripeSessionId = req.session.last_stripe_session_id || null;

    if (lastStripeSessionId && now - lockAt < CHECKOUT_LOCK_MS) {
      const s = await stripe.checkout.sessions.retrieve(lastStripeSessionId);
      if (s?.url) return res.json({ url: s.url });
    }

    req.session.checkout_lock_at = now;

    const variantIds = cart.items.map(i => i.variant_id);
    const { rows: variants } = await pool.query(
      `
      SELECT pv.id, pv.price_xpf, pv.stripe_price_id, p.id AS product_id
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ANY($1::uuid[])
        AND pv.active = true
        AND p.active = true
      `,
      [variantIds]
    );

    if (variants.length !== cart.items.length) {
      throw new AppError('VARIANT_MISMATCH', 400);
    }

    const map = new Map(variants.map(v => [v.id, v]));
    let totalXpf = 0;
    cart.items.forEach(i => {
      totalXpf += map.get(i.variant_id).price_xpf * i.quantity;
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `
        INSERT INTO orders (session_id, amount_xpf, status)
        VALUES ($1, $2, 'pending')
        RETURNING id
        `,
        [sessionId, totalXpf]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of cart.items) {
        const v = map.get(item.variant_id);
        await client.query(
          `
          INSERT INTO order_items
          (order_id, product_id, variant_id, quantity, unit_price_xpf, total_xpf)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [
            orderId,
            v.product_id,
            v.id,
            item.quantity,
            v.price_xpf,
            v.price_xpf * item.quantity
          ]
        );
      }

      const stripeSession = await createStripeSessionSafe({
        mode: 'payment',
        line_items: cart.items.map(i => ({
          price: map.get(i.variant_id).stripe_price_id,
          quantity: i.quantity
        })),
        success_url: `${env.PUBLIC_BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.PUBLIC_BASE_URL}/cart.html`,
        metadata: { order_id: orderId }
      });

      await client.query(
        `
        UPDATE orders
        SET stripe_session_id = $1
        WHERE id = $2
        `,
        [stripeSession.id, orderId]
      );

      await client.query('COMMIT');

      req.session.last_stripe_session_id = stripeSession.id;
      return res.json({ url: stripeSession.url });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

/* =========================
   CONFIRM PAYMENT (FIX)
========================= */

router.get('/confirm', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ status: 'error' });

  try {
    const stripeSession = await stripe.checkout.sessions.retrieve(session_id);

    if (stripeSession.payment_status !== 'paid') {
      return res.json({ status: 'pending' });
    }

    const orderId = stripeSession.metadata?.order_id;
    if (!orderId) return res.status(400).json({ status: 'error' });

    // 🔒 idempotent + PRIORITAIRE
    await pool.query(
      `
      UPDATE orders
      SET status = 'paid',
          updated_at = NOW()
      WHERE id = $1
        AND status <> 'paid'
      `,
      [orderId]
    );

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('CONFIRM ERROR', err);
    return res.status(500).json({ status: 'error' });
  }
});

module.exports = router;
