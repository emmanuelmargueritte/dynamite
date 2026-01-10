require('dotenv').config({
  path: require('path').resolve(__dirname, '../backend/.env')
});

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const Stripe = require('stripe');

const ALLOWED_SIZES = ['XS','S','M','L','XL','XXL'];

const FILE = path.resolve(__dirname, '../import/catalogue_produits.xlsx');
const IMAGES_DIR = path.resolve(__dirname, '../import/images');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function bool(v, def = true) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true';
}

async function run() {
  console.log('DATABASE_URL USED:', process.env.DATABASE_URL);

  const wb = XLSX.readFile(FILE);
  const sheet = wb.Sheets['variants'];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const r of rows) {
      if (!ALLOWED_SIZES.includes(r.size)) {
        throw new Error(`Taille invalide: ${r.size}`);
      }

      // 🖼️ upload image
      const imagePath = path.join(IMAGES_DIR, r.image_file);
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image manquante: ${r.image_file}`);
      }

      const upload = await cloudinary.uploader.upload(imagePath, {
        folder: 'dynamite/products'
      });

      // 🛒 product DB
      const { rows: prodRows } = await client.query(`
        INSERT INTO products (name, active, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (name)
        DO UPDATE SET updated_at = NOW()
        RETURNING id
      `, [r.product_name, bool(r.active)]);

      const productId = prodRows[0].id;

      // 💳 Stripe product
      const stripeProduct = await stripe.products.create({
        name: r.product_name
      });

      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Number(r.price_xpf),
        currency: 'xpf'
      });

      // 🎯 variant DB
      await client.query(`
        INSERT INTO product_variants (
          product_id, label, size, color, gender,
          price_xpf, stripe_price_id, image_url,
          stock, is_default, active,
          created_at, updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,$11,
          NOW(),NOW()
        )
      `, [
        productId,
        `${r.color} / ${r.size}`,
        r.size,
        r.color,
        r.gender || 'UNISEXE',
        Number(r.price_xpf),
        stripePrice.id,
        upload.secure_url,
        Number(r.stock || 2147483647),
        bool(r.is_default, false),
        bool(r.active, true)
      ]);
    }

    await client.query('COMMIT');
    console.log('✅ IMPORT TERMINÉ AVEC SUCCÈS');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ IMPORT ANNULÉ:', e.message);
  } finally {
    client.release();
    process.exit();
  }
}

run();
