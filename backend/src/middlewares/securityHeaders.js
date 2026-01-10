// backend/src/middlewares/securityHeaders.js
const helmet = require('helmet');
const { env } = require('../utils/env');

const isProd = env.NODE_ENV === 'production';

// ✅ CSP_MODE:
// - "audit"   => Report-Only (ne bloque rien)
// - "enforce" => Enforce (bloque)
// Par défaut : prod=enforce, dev=audit
const CSP_MODE = String(process.env.CSP_MODE || (isProd ? 'enforce' : 'audit')).toLowerCase();
const CSP_REPORT_ONLY = CSP_MODE !== 'enforce';

// En dev, on tolère localhost pour certains cas (hot reload / outils)
const devConnectSrc = isProd ? [] : [
  'http://localhost:3000',
  'http://localhost:8080'
];

module.exports = helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  frameguard: { action: 'sameorigin' }, // protège TES pages d'être iframées ailleurs (ok avec Stripe)

permissionsPolicy: {
  features: {
    geolocation: [],
    camera: [],
    microphone: [],
    payment: [],
    fullscreen: ['self']
  }
},

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

  "script-src": [
    "'self'"
  ],

  "style-src": [
    "'self'",
    "'unsafe-inline'"
  ],

  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com"
  ],

"connect-src": [
  "'self'",
  "https://api.cloudinary.com"
],


  "font-src": [
    "'self'",
    "data:"
  ],

  "connect-src": [
    "'self'"
  ],

  "form-action": ["'self'"],

  "report-uri": ["/api/csp-report"]
}

  }
});
