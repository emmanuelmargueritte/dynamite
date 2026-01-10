const express = require('express');
const Stripe = require('stripe');

const { env } = require('../utils/env');
const { pool } = require('../utils/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../errors/AppError');
const logEvent = require('../analytics/logEvent');

const router = express.Router();

/**
 * ✅ Instance Stripe UNIQUE
 */
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

const CHECKOUT_LOCK_MS = 5000;

/**
 * Détecte l'erreur Stripe: mode "payment" + price récurrent
 */
function isRecurringPriceInPaymentModeError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('payment` mode but passed a recurring price') ||
    msg.includes('switch to `subscription` mode') ||
    msg.toLowerCase().includes('recurring price')
  );
}

/**
 * Wrapper Stripe Checkout Session create
 */
async function createStripeSessionSafe(params) {
  try {
    return await stripe.checkout.sessions.create(params);
  } catch (err) {
    if (isRecurringPriceInPaymentModeError(err)) {
      throw new AppError(
        'CHECKOUT_PRODUCT_MISCONFIG',
        400,
        "Ce produit est mal configuré côté paiement. Merci de contacter le support."
      );
    }
    throw err;
  }
}

/**
 * POST /api/checkout/create-session
 */
router.post(
  '/create-session',
  asyncHandler(async (req, res) => {
    const sessionId = req.sessionID;
    const cart = req.session.cart;

    if (!sessionId) {
      throw new AppError('SESSION_MISSING', 400, 'Session utilisateur manquante');
    }

    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      throw new AppError('CART_EMPTY', 400, 'Panier vide');
    }

    // 🔒 Anti double-clic
    const now = Date.now();
    const lockAt = req.session.checkout_lock_at || 0;
    const lastStripeSessionId = req.session.last_stripe_session_id || null;

    if (lastStripeSessionId && now - lockAt < CHECKOUT_LOCK_MS) {
      const s = await stripe.checkout.sessions.retrieve(lastStripeSessionId);
      if (s?.url) return res.json({ url: s.url });
    }

    req.session.checkout_lock_at = now;

    // 🔁 Réutiliser une commande pending si elle existe
    const existingOrderRes = await pool.query(
      `
      SELECT id, stripe_session_id
      FROM orders
      WHERE session_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [sessionId]
    );

    if (existingOrderRes.rows.length) {
      const existing = existingOrderRes.rows[0];

      if (existing.stripe_session_id) {
        const s = await stripe.checkout.sessions.retrieve(existing.stripe_session_id);
        if (s?.url) {
          req.session.last_stripe_session_id = existing.stripe_session_id;
          return res.json({ url: s.url });
        }
      }
    }

    // ✅ Validation DB des variantes
    const variantIds = cart.items.map(i => i.variant_id).filter(Boolean);
    if (variantIds.length !== cart.items.length) {
      throw new AppError('VARIANT_MISSING', 400, 'variant_id manquant dans le panier');
    }

    const { rows: variants } = await pool.query(
      `
      SELECT
        pv.id AS variant_id,
        pv.price_xpf,
        pv.stripe_price_id,
        p.id AS product_id
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ANY($1::uuid[])
        AND pv.active = true
        AND p.active = true
      `,
      [variantIds]
    );

    if (variants.length !== cart.items.length) {
      throw new AppError('VARIANT_MISMATCH', 400, 'Variantes invalides');
    }

    const variantMap = new Map(variants.map(v => [v.variant_id, v]));

    let totalXpf = 0;
    for (const item of cart.items) {
      const v = variantMap.get(item.variant_id);
      totalXpf += v.price_xpf * item.quantity;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Création commande
      const orderRes = await client.query(
        `
        INSERT INTO orders (session_id, amount_xpf, status)
        VALUES ($1, $2, 'pending')
        RETURNING id
        `,
        [sessionId, totalXpf]
      );

      const orderId = orderRes.rows[0].id;

      // Order items
      for (const item of cart.items) {
        const v = variantMap.get(item.variant_id);
        await client.query(
          `
          INSERT INTO order_items
            (order_id, product_id, variant_id, quantity, unit_price_xpf, total_xpf)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            orderId,
            v.product_id,
            v.variant_id,
            item.quantity,
            v.price_xpf,
            v.price_xpf * item.quantity
          ]
        );
      }

      // Stripe checkout session
      const line_items = cart.items.map(item => {
        const v = variantMap.get(item.variant_id);
        return {
          price: v.stripe_price_id,
          quantity: item.quantity
        };
      });

      const stripeSession = await createStripeSessionSafe({
        mode: 'payment',
        line_items,
        success_url: `${env.PUBLIC_BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.PUBLIC_BASE_URL}/cart.html`,
        metadata: {
          order_id: orderId,
          app: 'dynamite'
        }
      });

      if (!stripeSession?.id || !stripeSession?.url) {
        throw new AppError('STRIPE_SESSION_FAILED', 502, 'Échec création session Stripe');
      }

      await client.query(
        `
        UPDATE orders
        SET stripe_session_id = $1,
            updated_at = NOW()
        WHERE id = $2
        `,
        [stripeSession.id, orderId]
      );

      await client.query('COMMIT');

      req.session.last_stripe_session_id = stripeSession.id;

      await logEvent({
        eventType: 'funnel_step',
        funnelStep: 'checkout',
        page: '/checkout',
        referrer: req.get('referer') || null
      });

      return res.json({ url: stripeSession.url });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

/**
 * ✅ CONFIRMATION PAIEMENT (ROBUSTE)
 * GET /api/checkout/confirm?session_id=cs_test_...
 */
router.get('/confirm', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      status: 'error',
      message: 'missing session_id'
    });
  }

  try {
    // 1️⃣ récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'payment not completed'
      });
    }

    const orderId = session.metadata?.order_id;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'order_id missing in Stripe metadata'
      });
    }

    // 2️⃣ update commande par ID (clé métier)
    const result = await pool.query(
      `
      UPDATE orders
      SET status = 'paid',
          stripe_session_id = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [orderId, session_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'order not found'
      });
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Stripe confirm error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'stripe confirmation failed'
    });
  }
});

module.exports = router;
