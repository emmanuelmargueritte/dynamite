BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ADMINS (max 3 enforced in app)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  two_factor_secret TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- SESSIONS (connect-pg-simple)
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_xpf INTEGER NOT NULL CHECK (price_xpf >= 0),
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- VARIANTS (size+color, stock)
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  UNIQUE (product_id, size, color)
);

-- IMAGES (Cloudinary URLs)
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ORDERS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'DRAFT',
      'PENDING_PAYMENT',
      'PAID',
      'PREPARING',
      'READY_FOR_PICKUP',
      'SHIPPED',
      'COMPLETED',
      'CANCELLED',
      'REFUNDED'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'DRAFT',
  total_xpf INTEGER NOT NULL CHECK (total_xpf >= 0),
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('DELIVERY', 'CLICK_COLLECT')),
  delivery_fee_xpf INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  invoice_number TEXT UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_xpf INTEGER NOT NULL CHECK (unit_price_xpf >= 0)
);

-- CARTS (saved for logged-in users)
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- INVOICE COUNTERS (persistent numbering)
CREATE TABLE IF NOT EXISTS invoice_counters (
  year INTEGER PRIMARY KEY,
  counter INTEGER NOT NULL
);

COMMIT;
