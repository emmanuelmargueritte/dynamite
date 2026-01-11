const fs = require("fs");
const path = require("path");
const { sendMail } = require("./transporter");

async function sendAdminOrderNotification({ orderId, email }) {
  const templatePath = path.join(
    __dirname,
    "templates",
    "adminOrderNotification.html"
  );

  let html = fs.readFileSync(templatePath, "utf8");
  html = html.replace("{{ORDER_ID}}", orderId);
  html = html.replace("{{CLIENT_EMAIL}}", email);

  await sendMail({
    to: process.env.MAIL_ADMIN,
    subject: "Nouvelle commande reçue",
    text: `Nouvelle commande confirmée.\n\nCommande n° ${orderId}\nClient : ${email}`,
    html,
  });
}

module.exports = sendAdminOrderNotification;
