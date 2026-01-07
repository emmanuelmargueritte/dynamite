const Stripe = require('stripe');
const { env } = require('../utils/env');

const getStripeKeys = () => {
  const mode = (env.STRIPE_MODE || 'test').toLowerCase();
  const isLive = mode === 'live';

  const secretKey = isLive ? env.STRIPE_SECRET_KEY_LIVE : env.STRIPE_SECRET_KEY_TEST;
  const publishableKey = isLive ? env.STRIPE_PUBLISHABLE_KEY_LIVE : env.STRIPE_PUBLISHABLE_KEY_TEST;
  const webhookSecret = isLive ? env.STRIPE_WEBHOOK_SECRET_LIVE : env.STRIPE_WEBHOOK_SECRET_TEST;

  if (!secretKey) {
    const err = new Error('Stripe secret key missing for current STRIPE_MODE');
    err.statusCode = 500;
    throw err;
  }

  return { isLive, secretKey, publishableKey, webhookSecret };
};

let stripeClient = null;

const getStripe = () => {
  if (!stripeClient) {
    const { secretKey } = getStripeKeys();
    stripeClient = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  }
  return stripeClient;
};

module.exports = { getStripe, getStripeKeys };
