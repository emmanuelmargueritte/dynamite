/**
 * Configuration Express principale
 */
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression'); // ✅ NEW

const requireAdmin = require('./middlewares/requireAdmin');

const { env } = require('./utils/env');
const { pool } = require('./utils/db');

// 🔐 Session middleware centralisé
const createSessionMiddleware = require('../config/session');

// 🛡️ CSRF admin ONLY
const adminCsrfProtection = require('./middlewares/adminCsrf');
const adminAuthRoutes = require('./routes/admin.auth.routes');

const securityHeaders = require('./middlewares/securityHeaders');
const rateLimit = require('./middlewares/rateLimit');
const errorHandler = require('./middlewares/errorHandler');

// Routes
const publicRoutes = require('./routes/public.routes');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/orders.routes');

const adminRoutes = require('./routes/admin.routes');
const adminOrdersRoutes = require('./routes/admin.orders.routes');
const adminProductsRoutes = require('./routes/admin.products.routes');

// ✅ categories routes
const adminCategoriesRoutes = require('./routes/admin.categories.routes');
const publicCategoriesRoutes = require('./routes/public.categories.routes');

const checkoutRoutes = require('./routes/checkout.routes');
const webhookRoutes = require('./routes/webhooks.routes');

// ✅ SEO + SSR
const seoRoutes = require('./routes/seo.routes');
const ssrRoutes = require('./routes/ssr.routes');

// ✅ NEW: settings (branding)
const settingsRoutes = require('./routes/settings.routes');

const app = express();

if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/* =========================================================
   🪵 LOGS / SÉCURITÉ GLOBALE
   ========================================================= */
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ✅ on désactive la CSP par défaut de helmet (sinon double CSP -> Cloudinary bloqué)
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://res.cloudinary.com"
      ],
      connectSrc: [
        "'self'",
        "https://api.cloudinary.com"
      ],
    },
  })
);


app.use(cors({
  origin: env.PUBLIC_BASE_URL,
  credentials: true
}));

// ✅ compression HTTP
app.use(compression());

/* =========================================================
   ⚠️ STRIPE WEBHOOK — RAW BODY OBLIGATOIRE
   ========================================================= */
app.use(
  '/api/webhooks',
  webhookRoutes.rawBodyMiddleware,
  webhookRoutes.router
);

/* =========================================================
   🧱 PARSERS STANDARD
   ========================================================= */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =========================================================
   🔐 SESSIONS (AUTH / PANIER / ADMIN)
   ========================================================= */
app.use(createSessionMiddleware(pool));

/* =========================================================
   🤖 SEO (robots/sitemap/redirects canon)
   ========================================================= */
app.use(seoRoutes);

/* =========================================================
   🧩 SSR (shop + product) — DOIT ÊTRE AVANT express.static
   ========================================================= */
app.use(ssrRoutes);

/* =========================================================
   🔓 ROUTES PUBLIQUES API
   ========================================================= */
app.use('/api/public', publicRoutes);
app.use('/api/public/categories', publicCategoriesRoutes);
app.use('/api/public/settings', settingsRoutes);

/* =========================================================
   🔐 AUTH (RATE LIMIT CIBLÉ)
   ========================================================= */
app.use('/api/auth', rateLimit, authRoutes);

/* =========================================================
   🛒 PANIER & COMMANDES
   ========================================================= */
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);

/* =========================================================
   🔐 ADMIN AUTH (login / logout / me) — RATE LIMIT + CSRF
   ========================================================= */
app.use(
  '/api/admin/auth',
  rateLimit,
  adminCsrfProtection,
  adminAuthRoutes
);

/* =========================================================
   🔐 ADMIN ROUTES PROTÉGÉES
   ========================================================= */
app.use('/api/admin/products', requireAdmin, adminProductsRoutes);
app.use('/api/admin/orders', requireAdmin, adminOrdersRoutes);
app.use('/api/admin/categories', requireAdmin, adminCategoriesRoutes);
app.use('/api/admin/settings', requireAdmin, settingsRoutes);
app.use(
  '/api/admin/analytics',
  requireAdmin,
  require('./routes/admin.analytics.routes')
);



app.use('/api/admin', requireAdmin, adminRoutes);

/* =========================================================
   ❤️ HEALTHCHECK
   ========================================================= */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* =========================================================
   🖥️ FRONTEND STATIC
   ========================================================= */
app.use(
  express.static(path.join(__dirname, '../../frontend'), {
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      const isAdminFile = filePath.includes(`${path.sep}admin${path.sep}`);
      const isJsOrCss = filePath.endsWith('.js') || filePath.endsWith('.css');

      if (isAdminFile && isJsOrCss) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      if (env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0');
      }
    }
  })
);

/* =========================================================
   🧭 FRONTEND FALLBACK (SPA)
   ========================================================= */
app.get('*', (req, res, next) => {
  const filePath = path.join(__dirname, '../../frontend', req.path);

  if (filePath.endsWith('.html')) {
    return res.sendFile(filePath, err => {
      if (err) next();
    });
  }

  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

/* =========================================================
   ❗ ERROR HANDLER — TOUJOURS EN DERNIER
   ========================================================= */
app.use(errorHandler);

module.exports = app;
