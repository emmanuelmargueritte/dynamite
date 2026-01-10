require('dotenv').config({
  path: require('path').resolve(__dirname, '../backend/.env')
});

console.log('DATABASE_URL USED:', process.env.DATABASE_URL);

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

const FILE = process.argv[2];
if (!FILE) {
  console.error('❌ Usage: node scripts/importProductsFromCsv.js fichier.csv');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function normBool(v, def = true) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true';
}

function normInt(v, def = 0) {
  const n = Number(v);
  return Number.isInteger(n) ? n : def;
}

async function run() {
  const rows = [];

  fs.createReadStream(path.resolve(FILE))
    .pipe(csv())
    .on('data', row => rows.push(row))
    .on('end', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        for (const r of rows) {
          const productName = String(r.product_name || '').trim();
          if (!productName) continue;

          // 1️⃣ upsert product
          const { rows: prodRows } = await client.query(
            `
            INSERT INTO products (name, price_xpf, image_url, active, created_at, updated_at)
            VALUES ($1,$2,$3,$4,NOW(),NOW())
            ON CONFLICT (name)
            DO UPDATE SET
              price_xpf = EXCLUDED.price_xpf,
              image_url = EXCLUDED.image_url,
              active = EXCLUDED.active,
              updated_at = NOW()
            RETURNING id
            `,
            [
              productName,
              normInt(r.price_xpf),
              r.image_url || null,
              normBool(r.active, true)
            ]
          );

          const productId = prodRows[0].id;

          // 2️⃣ insert variant
          await client.query(
            `
            INSERT INTO product_variants (
              product_id,
              label,
              size,
              color,
              gender,
              price_xpf,
              image_url,
              stock,
              is_default,
              active,
              created_at,
              updated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()
            )
            ON CONFLICT (product_id, size, color, gender)
            DO UPDATE SET
              price_xpf = EXCLUDED.price_xpf,
              image_url = EXCLUDED.image_url,
              stock = EXCLUDED.stock,
              is_default = EXCLUDED.is_default,
              active = EXCLUDED.active,
              updated_at = NOW()
            `,
            [
              productId,
              `${r.color} / ${r.size}`,
              r.size || 'M',
              r.color || 'DEFAULT',
              r.gender || 'UNISEXE',
              normInt(r.price_xpf),
              r.image_url || null,
              normInt(r.stock, 2147483647),
              normBool(r.is_default, false),
              normBool(r.active, true)
            ]
          );
        }

        await client.query('COMMIT');
        console.log('✅ Import terminé avec succès');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Import annulé (rollback)', e.message);
      } finally {
        client.release();
        process.exit();
      }
    });
}

run();
