require("dotenv").config();


const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },


});

transporter.sendMail(
  {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_FROM,
    subject: "Test SMTP Dynamite",
    text: "SMTP OK",
  },
  (err, info) => {
    if (err) {
      console.error("SMTP ERROR", err);
    } else {
      console.log("EMAIL ENVOYÉ");
    }
    process.exit();
  }
);

