const fs = require("fs");
const path = require("path");
const { pool } = require("../utils/db");
const { sendMail } = require("./transporter");

async function sendOrderConfirmation({ to, orderId }) {
  const { rows } = await pool.query(
    `
    SELECT
      o.amount_xpf,
      p.name AS product_name,
      pv.size,
      pv.color,
      oi.quantity,
      oi.unit_price_xpf
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN product_variants pv ON pv.id = oi.variant_id
    WHERE o.id = $1
    `,
    [orderId]
  );

  if (rows.length === 0) return;

  const itemsRows = rows.map(item => `
    <tr>
      <td>${item.product_name} – ${item.size || ""} / ${item.color || ""}</td>
      <td align="center">${item.quantity}</td>
      <td align="right">${item.unit_price_xpf} XPF</td>
    </tr>
  `).join("");

  const templatePath = path.join(__dirname, "templates", "orderConfirmation.html");
  let html = fs.readFileSync(templatePath, "utf8");

  html = html
    .replace("{{ORDER_ID}}", orderId)
    .replace("{{ITEMS_ROWS}}", itemsRows)
    .replace("{{TOTAL_XPF}}", rows[0].amount_xpf);

  await sendMail({
    to,
    subject: "Confirmation de votre commande – Dynamite",
    text: `Merci pour votre commande.\nCommande n° ${orderId}`,
    html,
  });
}

module.exports = sendOrderConfirmation;
