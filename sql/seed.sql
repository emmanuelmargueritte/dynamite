BEGIN;

-- ADMIN DEFAULT
-- email: admin@dynamite.nc
-- password: admin123 (CHANGE IMMEDIATELY)
INSERT INTO admins (email, password_hash)
VALUES (
  'admin@dynamite.nc',
  '$2b$10$ZyJ3Z8QkQk8nHhHq7f7H8u2y2M1hXxZrN3H9R0B8pP8wU9k2d7R5y'
)
ON CONFLICT (email) DO NOTHING;

-- DEMO PRODUCTS
INSERT INTO products (id, name, description, price_xpf, category)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'T-Shirt Noir', 'T-shirt coton premium', 3500, 'Hauts'),
  ('22222222-2222-2222-2222-222222222222', 'Jean Slim', 'Jean coupe slim', 8900, 'Bas')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_variants (product_id, size, color, stock)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'M', 'Noir', 20),
  ('11111111-1111-1111-1111-111111111111', 'L', 'Noir', 15),
  ('22222222-2222-2222-2222-222222222222', '40', 'Bleu', 10)
ON CONFLICT (product_id, size, color) DO UPDATE SET stock = EXCLUDED.stock;

INSERT INTO product_images (product_id, image_url)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'https://res.cloudinary.com/demo/image/upload/tshirt.jpg'),
  ('22222222-2222-2222-2222-222222222222', 'https://res.cloudinary.com/demo/image/upload/jean.jpg')
ON CONFLICT DO NOTHING;

COMMIT;
