const Stripe = require('stripe');
const { env } = require('../utils/env');
const { pool } = require('../utils/db');

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

module.exports = async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('✅ Stripe event received:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const stripeSessionId = session.id; // cs_test_...
      const paymentIntentId = session.payment_intent || null; // pi_...
      const orderId = session?.metadata?.order_id || null; // ✅ source de vérité

      let result;

      if (orderId) {
        // ✅ Update par order_id (robuste même si stripe_session_id a été régénéré)
        result = await pool.query(
          `
          UPDATE orders
          SET status='paid',
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
              stripe_session_id = COALESCE(stripe_session_id, $3),
              updated_at = NOW()
          WHERE id = $1
            AND status <> 'paid'
          `,
          [orderId, paymentIntentId, stripeSessionId]
        );
      } else {
        // 🔁 Fallback (compat anciens paiements sans metadata)
        result = await pool.query(
          `
          UPDATE orders
          SET status='paid',
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
              updated_at = NOW()
          WHERE stripe_session_id = $1
            AND status <> 'paid'
          `,
          [stripeSessionId, paymentIntentId]
        );
      }

      console.log(
        '🧾 Webhook update orders:',
        'order_id=',
        orderId || 'null',
        'stripe_session_id=',
        stripeSessionId,
        'rowCount=',
        result.rowCount
      );
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};
