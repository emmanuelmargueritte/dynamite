const { pool } = require('../utils/db');
const { assertIntXpf, sumInt } = require('../utils/amounts');
const { getDeliveryFeeXpf, DELIVERY_METHODS } = require('./shippingService');

const computeTotalsAndValidateStock = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Cart is empty');
    err.statusCode = 400;
    throw err;
  }

  const normalized = items.map((it) => {
    const variantId = String(it.variant_id || '').trim();
    const quantity = Number(it.quantity);

    if (!variantId) {
      const err = new Error('variant_id is required');
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error('quantity must be a positive integer');
      err.statusCode = 400;
      throw err;
    }

    return { variantId, quantity };
  });

  return await pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');

      const variantIds = normalized.map((x) => x.variantId);

      const { rows: variantRows } = await client.query(
        `
        SELECT v.id AS variant_id, v.stock, p.id AS product_id, p.name, p.description, p.price_xpf, p.active
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.id = ANY($1::uuid[])
        FOR UPDATE
        `,
        [variantIds]
      );

      if (variantRows.length !== variantIds.length) {
        const err = new Error('One or more variants not found');
        err.statusCode = 400;
        throw err;
      }

      const lineItems = normalized.map((n) => {
        const row = variantRows.find((r) => r.variant_id === n.variantId);
        if (!row.active) {
          const err = new Error(`Product inactive: ${row.name}`);
          err.statusCode = 400;
          throw err;
        }

        const unitPrice = assertIntXpf(row.price_xpf, 'price_xpf');

        if (row.stock < n.quantity) {
          const err = new Error(`Insufficient stock for ${row.name}`);
          err.statusCode = 409;
          throw err;
        }

        return {
          product_id: row.product_id,
          variant_id: row.variant_id,
          name: row.name,
          description: row.description,
          unit_price_xpf: unitPrice,
          quantity: n.quantity
        };
      });

      const subtotal = sumInt(lineItems.map((li) => li.unit_price_xpf * li.quantity));

      await client.query('COMMIT');
      return { lineItems, subtotal_xpf: subtotal };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
};

const validateDeliveryMethod = (deliveryMethod) => {
  const dm = String(deliveryMethod || '').trim();
  if (dm !== DELIVERY_METHODS.DELIVERY && dm !== DELIVERY_METHODS.CLICK_COLLECT) {
    const err = new Error('delivery_method must be DELIVERY or CLICK_COLLECT');
    err.statusCode = 400;
    throw err;
  }
  return dm;
};

module.exports = { computeTotalsAndValidateStock, validateDeliveryMethod, getDeliveryFeeXpf };
