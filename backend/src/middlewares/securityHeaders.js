const helmet = require('helmet');
const { env } = require('../utils/env');

module.exports = helmet({
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'self'"],

      // 🖼️ Images (Cloudinary + data/blob)
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com"
      ],

      // 🎨 Styles
      "style-src": [
        "'self'",
        "'unsafe-inline'"
      ],

      // 📜 Scripts
      "script-src": [
        "'self'"
      ],

      // 🔌 API calls (Stripe + Cloudinary upload)
      "connect-src": [
        "'self'",
        "http://localhost:3000",
        "http://localhost:8080",
        "https://api.stripe.com",
        "https://api.cloudinary.com"
      ],

      // 💳 Iframes Stripe
      "frame-src": [
        "'self'",
        "https://js.stripe.com"
      ],

      // 📨 Formulaires
      "form-action": [
        "'self'"
      ]
    }
  }
});
