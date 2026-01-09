const { pool } = require("../utils/db");

async function logEvent({
  eventType,
  page = null,
  funnelStep = null,
  orderId = null,
  referrer = null,
}) {
  try {
    await pool.query(
      `
      INSERT INTO analytics_events (
        event_type,
        page,
        funnel_step,
        order_id,
        referrer
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [eventType, page, funnelStep, orderId, referrer]
    );
  } catch (err) {
    // Analytics ne doivent JAMAIS casser le flux principal
    console.error("❌ Analytics error:", err.message);
  }
}

module.exports = logEvent;
