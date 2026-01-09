const transporter = require("./transporter");

async function sendAdminOrderNotification({ orderId, email }) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.MAIL_ADMIN,
    subject: "Nouvelle commande reçue",
    text: `Nouvelle commande confirmée.\n\nCommande n° ${orderId}\nClient : ${email}`,
  });
}

module.exports = sendAdminOrderNotification;
