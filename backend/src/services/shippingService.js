const { env } = require('../utils/env');
const { assertIntXpf } = require('../utils/amounts');

const DELIVERY_METHODS = {
  DELIVERY: 'DELIVERY',
  CLICK_COLLECT: 'CLICK_COLLECT'
};

const getDeliveryFeeXpf = (deliveryMethod, cartSubtotalXpf) => {
  const subtotal = assertIntXpf(cartSubtotalXpf, 'cart_subtotal_xpf');

  if (deliveryMethod === DELIVERY_METHODS.CLICK_COLLECT) return 0;

  if (deliveryMethod !== DELIVERY_METHODS.DELIVERY) {
    const err = new Error('Invalid delivery_method');
    err.statusCode = 400;
    throw err;
  }

  if (!env.DELIVERY_ENABLED) {
    const err = new Error('Delivery is disabled');
    err.statusCode = 400;
    throw err;
  }

  const fee = assertIntXpf(env.DELIVERY_FEE_XPF, 'DELIVERY_FEE_XPF');
  const freeThreshold = assertIntXpf(env.DELIVERY_FREE_THRESHOLD_XPF, 'DELIVERY_FREE_THRESHOLD_XPF');
  return subtotal >= freeThreshold ? 0 : fee;
};

module.exports = { DELIVERY_METHODS, getDeliveryFeeXpf };
