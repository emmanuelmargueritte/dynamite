const fs = require("fs");
const path = require("path");
const transporter = require("./transporter");

async function sendOrderConfirmation({ to, orderId }) {
  const templatePath = path.join(
    __dirname,
    "templates",
    "orderConfirmation.html"
  );

  let html = fs.readFileSync(templatePath, "utf8");
  html = html.replace("{{ORDER_ID}}", orderId);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Confirmation de votre commande",
    text: `Merci pour votre commande.\n\nCommande n° ${orderId}\n\n— L’équipe Dynamite`,
    html,
  });
}

module.exports = sendOrderConfirmation;
