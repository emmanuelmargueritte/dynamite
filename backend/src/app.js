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
app.use(helmet());
app.use(securityHeaders);

app.use(cors({
  origin: env.PUBLIC_BASE_URL,
  credentials: true
}));

// ✅ NEW: compression HTTP (avant les routes)
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
   🚦 RATE LIMITING (APRÈS SESSION)
   ========================================================= */
app.use(rateLimit);

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

// public categories (liste des catégories en haut du shop)
app.use('/api/public/categories', publicCategoriesRoutes);

// ✅ NEW: public settings
app.use('/api/public/settings', settingsRoutes);

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);

/* =========================================================
   🛒 PANIER & COMMANDES
   ========================================================= */
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);

/* =========================================================
   🔐 ADMIN AUTH (login / logout / me)
   ========================================================= */
app.use(
  '/api/admin/auth',
  adminCsrfProtection,
  adminAuthRoutes
);

/* =========================================================
   🔐 ADMIN ROUTES PROTÉGÉES
   ========================================================= */
app.use('/api/admin/products', requireAdmin, adminProductsRoutes);
app.use('/api/admin/orders', requireAdmin, adminOrdersRoutes);

// admin categories (CRUD)
app.use('/api/admin/categories', requireAdmin, adminCategoriesRoutes);

// ✅ NEW: admin settings
app.use('/api/admin/settings', requireAdmin, settingsRoutes);

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
    maxAge: 0, // on gère via setHeaders
    setHeaders: (res, filePath) => {
      // ✅ HTML: jamais en cache (dev + prod)
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      // ✅ Assets: cache seulement en prod
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
