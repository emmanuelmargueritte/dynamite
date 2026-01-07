const express = require('express');
const stripeWebhookHandler = require('../webhooks/stripeWebhookHandler');

const router = express.Router();

/**
 * Stripe exige le RAW body pour vérifier la signature.
 * Comme tu montes déjà rawBodyMiddleware dans app.js AVANT express.json,
 * req.body sera un Buffer ici.
 */
const rawBodyMiddleware = express.raw({ type: 'application/json' });

router.post('/stripe', stripeWebhookHandler);

module.exports = { rawBodyMiddleware, router };
