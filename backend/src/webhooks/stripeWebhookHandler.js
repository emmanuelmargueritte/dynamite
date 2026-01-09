const Stripe = require('stripe');
const { env } = require('../utils/env');
const { pool } = require('../utils/db');
const sendOrderConfirmation = require('../mail/sendOrderConfirmation');
const sendAdminOrderNotification = require('../mail/sendAdminOrderNotification');


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
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('✅ Stripe event received:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const stripeSessionId = session.id;
      const paymentIntentId = session.payment_intent || null;
      const orderId = session?.metadata?.order_id || null;

      let result;

      if (orderId) {
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

      // ✅ ENVOI EMAIL CONFIRMATION (UNE SEULE FOIS)
      if (result.rowCount === 1 && session.customer_details?.email) {
        await sendOrderConfirmation({
          to: session.customer_details.email,
          orderId: orderId || stripeSessionId,
        });
      }
if (result.rowCount === 1) {
  await sendAdminOrderNotification({
    orderId: orderId || stripeSessionId,
    email: session.customer_details?.email || 'unknown',
  });
}

    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};
