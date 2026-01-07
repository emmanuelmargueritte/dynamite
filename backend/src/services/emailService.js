const nodemailer = require('nodemailer');
const { env } = require('../utils/env');

/**
 * ⚠️ EMAIL À CONFIGURER AVANT MISE EN PRODUCTION
 * Si SMTP non configuré, les emails sont ignorés (sans bloquer le checkout).
 */
let transporter = null;

const isConfigured = () => env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS;

const getTransporter = () => {
  if (!isConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });

  return transporter;
};

module.exports = {
  async sendOrderConfirmation({ to, order, invoicePdf }) {
    if (!to) return;
    const transport = getTransporter();
    if (!transport) return;

    const itemsHtml = order.items
      .map((i) => `<li>${i.quantity} × ${i.unit_price_xpf} XPF</li>`)
      .join('');

    const html = `
      <h2>Merci pour votre commande – Dynamite</h2>
      <p>Commande n° <b>${order.id}</b></p>
      <ul>${itemsHtml}</ul>
      <p>Total : <b>${order.total_xpf} XPF</b></p>
      <p>Mode : ${order.delivery_method === 'CLICK_COLLECT' ? 'Click & Collect (gratuit)' : 'Livraison Nouméa + Grand Nouméa'}</p>
      <p>Adresse magasin : ${env.STORE_ADDRESS}</p>
    `;

    await transport.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: 'Confirmation de commande – Dynamite',
      html,
      attachments: [
        { filename: `facture-${order.invoice_number}.pdf`, content: invoicePdf }
      ]
    });
  }
};
