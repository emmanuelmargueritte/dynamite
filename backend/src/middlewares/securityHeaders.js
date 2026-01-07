// backend/src/middlewares/securityHeaders.js
const helmet = require('helmet');
const { env } = require('../utils/env');

const isProd = env.NODE_ENV === 'production';

// ✅ Phase 2 (audit) : CSP en REPORT-ONLY pour ne rien casser.

const CSP_REPORT_ONLY = !isProd; // dev = report-only, prod = enforce


// En dev, on tolère localhost pour certains cas (hot reload / outils)
const devConnectSrc = isProd ? [] : [
  'http://localhost:3000',
  'http://localhost:8080'
];

module.exports = helmet({
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
  frameguard: { action: 'sameorigin' }, // protège TES pages d'être iframées ailleurs (ok avec Stripe)
  noSniff: true,
  xssFilter: false,

  contentSecurityPolicy: {
    useDefaults: true,
    reportOnly: CSP_REPORT_ONLY,
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

      // 🎨 Styles (tu as du style inline dans l’admin => on garde sans refacto)
      "style-src": [
        "'self'",
        "'unsafe-inline'"
      ],

      // 📜 Scripts (Stripe Checkout)
      "script-src": [
        "'self'",
        "https://js.stripe.com"
      ],

      // 🔌 API calls (Stripe + Cloudinary upload)
      "connect-src": [
        "'self'",
        ...devConnectSrc,
        "https://api.stripe.com",
        "https://checkout.stripe.com",
        "https://hooks.stripe.com",
        "https://*.stripe.com",
        "https://api.cloudinary.com"
      ],

      // 💳 Iframes Stripe
      "frame-src": [
        "'self'",
        "https://js.stripe.com",
        "https://hooks.stripe.com",
        "https://checkout.stripe.com"
      ],

      // 🔤 Fonts (safe)
      "font-src": [
        "'self'",
        "data:"
      ],

      // 📨 Formulaires (empêche post vers ailleurs)
      "form-action": ["'self'"],

      // ✅ permet aux navigateurs de reporter les violations (Report-Only)
      "report-uri": ["/api/csp-report"]
    }
  }
});
