require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
console.log('ENV CHECK STRIPE TEST =', process.env.STRIPE_SECRET_KEY_TEST);


const toBool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true';
};

const toInt = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const required = (name, v) => {
  if (v === undefined || v === null || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
};

const NODE_ENV = process.env.NODE_ENV || 'development';

const env = {
  NODE_ENV,
  PORT: toInt(process.env.PORT, 3000),

  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:8080',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',

  DATABASE_URL: process.env.DATABASE_URL || '',
  PGSSLMODE: process.env.PGSSLMODE || '',

  SESSION_SECRET: required('SESSION_SECRET', process.env.SESSION_SECRET),
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'dynamite.sid',
  SESSION_COOKIE_SECURE: toBool(process.env.SESSION_COOKIE_SECURE, NODE_ENV === 'production'),
  SESSION_COOKIE_SAMESITE: process.env.SESSION_COOKIE_SAMESITE || 'lax',
  SESSION_TTL_SECONDS: toInt(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7),

  CSRF_ENABLED: toBool(process.env.CSRF_ENABLED, true),

  RATE_LIMIT_WINDOW_MS: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 200),

  ADMIN_MAX_ACCOUNTS: toInt(process.env.ADMIN_MAX_ACCOUNTS, 3),
  TWO_FACTOR_ENABLED: toBool(process.env.TWO_FACTOR_ENABLED, false),

  STRIPE_MODE: process.env.STRIPE_MODE || 'test',
  STRIPE_SECRET_KEY_TEST: process.env.STRIPE_SECRET_KEY_TEST || '',
  STRIPE_PUBLISHABLE_KEY_TEST: process.env.STRIPE_PUBLISHABLE_KEY_TEST || '',
  STRIPE_WEBHOOK_SECRET_TEST: process.env.STRIPE_WEBHOOK_SECRET_TEST || '',
  STRIPE_SECRET_KEY_LIVE: process.env.STRIPE_SECRET_KEY_LIVE || '',
  STRIPE_PUBLISHABLE_KEY_LIVE: process.env.STRIPE_PUBLISHABLE_KEY_LIVE || '',
  STRIPE_WEBHOOK_SECRET_LIVE: process.env.STRIPE_WEBHOOK_SECRET_LIVE || '',

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || 'dynamite/products',

  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: toInt(process.env.SMTP_PORT, 587),
  SMTP_SECURE: toBool(process.env.SMTP_SECURE, false),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'Dynamite <no-reply@dynamite.nc>',

  DELIVERY_ENABLED: toBool(process.env.DELIVERY_ENABLED, true),
  DELIVERY_ZONE_NAME: process.env.DELIVERY_ZONE_NAME || 'Nouméa + Grand Nouméa',
  DELIVERY_FEE_XPF: toInt(process.env.DELIVERY_FEE_XPF, 1500),
  DELIVERY_FREE_THRESHOLD_XPF: toInt(process.env.DELIVERY_FREE_THRESHOLD_XPF, 10000),

  CLICK_AND_COLLECT_ENABLED: toBool(process.env.CLICK_AND_COLLECT_ENABLED, true),
  STORE_NAME: process.env.STORE_NAME || 'dynamite',
  STORE_ADDRESS: process.env.STORE_ADDRESS || '42 Rue Georges CLEMENCEAU. 98800',

  INVOICE_COMPANY_NAME: process.env.INVOICE_COMPANY_NAME || 'Dynamite',
  INVOICE_COMPANY_ADDRESS: process.env.INVOICE_COMPANY_ADDRESS || '42 Rue Georges CLEMENCEAU. 98800',
  INVOICE_COMPANY_COUNTRY: process.env.INVOICE_COMPANY_COUNTRY || 'Nouvelle-Calédonie',
  INVOICE_CURRENCY: process.env.INVOICE_CURRENCY || 'XPF',
  INVOICE_PREFIX: process.env.INVOICE_PREFIX || 'DYN',

  COOKIES_CONSENT_DAYS: toInt(process.env.COOKIES_CONSENT_DAYS, 180)
};
// ✅ Clés Stripe "résolues" selon STRIPE_MODE
const stripeMode = String(env.STRIPE_MODE || 'test').toLowerCase();

env.STRIPE_SECRET_KEY =
  stripeMode === 'live'
    ? required('STRIPE_SECRET_KEY_LIVE', env.STRIPE_SECRET_KEY_LIVE)
    : required('STRIPE_SECRET_KEY_TEST', env.STRIPE_SECRET_KEY_TEST);

env.STRIPE_PUBLISHABLE_KEY =
  stripeMode === 'live'
    ? required('STRIPE_PUBLISHABLE_KEY_LIVE', env.STRIPE_PUBLISHABLE_KEY_LIVE)
    : required('STRIPE_PUBLISHABLE_KEY_TEST', env.STRIPE_PUBLISHABLE_KEY_TEST);

env.STRIPE_WEBHOOK_SECRET =
  stripeMode === 'live'
    ? required('STRIPE_WEBHOOK_SECRET_LIVE', env.STRIPE_WEBHOOK_SECRET_LIVE)
    : required('STRIPE_WEBHOOK_SECRET_TEST', env.STRIPE_WEBHOOK_SECRET_TEST);

module.exports = { env };
