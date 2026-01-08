const transporter = require("./transporter");

async function sendOrderConfirmation({ to, orderId }) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Confirmation de votre commande",
    text: `Merci pour votre commande.\n\nCommande n° ${orderId}\n\nÀ bientôt.`,
  });
}

module.exports = sendOrderConfirmation;
