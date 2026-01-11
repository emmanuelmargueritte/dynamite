const fetch = require("node-fetch");

function isConfigured() {
  return (
    process.env.BREVO_API_KEY &&
    process.env.EMAIL_FROM
  );
}

async function sendMail({ to, subject, html, text }) {
  // 🔍 DEBUG — À LAISSER TEMPORAIREMENT
  console.log("📨 BREVO sendMail CALLED", {
    hasKey: !!process.env.BREVO_API_KEY,
    from: process.env.EMAIL_FROM,
    to,
  });

  if (!isConfigured()) return;
  if (!to) return;

  const payload = {
    sender: {
      email: process.env.EMAIL_FROM,
      name: "Dynamite",
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Brevo error: ${error}`);
  }
}

module.exports = { sendMail };
