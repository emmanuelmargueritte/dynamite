require('dotenv').config({ path: 'backend/.env' });


const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');

const EXCEL_PATH = path.join(__dirname, '../import/catalogue_produits.xlsx');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function isTrue(val) {
  return val === true || val === 'TRUE' || val === 'true' || val === 1;
}


async function run() {
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  if (!rows.length) {
    console.error('❌ Excel vide');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Cache produits déjà créés (par nom)
    const productCache = new Map();

    for (const row of rows) {
      const {
        product_name,
        size,
        color,
        price_xpf,
        stripe_price_id,
        image_file,
        stock,
        is_default,
        active,
        gender
      } = row;

      if (!product_name || !size || !color || !price_xpf || !stripe_price_id) {
        console.warn('⏭️ Ligne ignorée (champs obligatoires manquants)', row);
        continue;
      }

      let productId = productCache.get(product_name);

     // 1️⃣ Création produit (UNE FOIS par nom)
if (!productId) {
  // on prend les infos de la variante DEFAULT
  if (!isTrue(is_default)) {
    console.warn(`⏭️ Produit "${product_name}" ignoré (aucune variante default rencontrée avant)`);
    continue;
  }

  const productRes = await client.query(
    `
    INSERT INTO products
      (name, price_xpf, stripe_price_id, image_url, active)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [
      product_name,
      Number(price_xpf),
      stripe_price_id,
      image_file || null,
      isTrue(active)
    ]
  );

  productId = productRes.rows[0].id;
  productCache.set(product_name, productId);
}


      // 2️⃣ Variante
      const label = `${size} / ${color}`;
      const attributes = { size, color };

      await client.query(
        `
        INSERT INTO product_variants
          (
            product_id,
            label,
            attributes,
            stock,
            price_xpf,
            stripe_price_id,
            image_url,
            active,
            is_default,
            size,
            gender,
            color
          )
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (product_id, size, color, gender) DO NOTHING
        `,
        [
          productId,
          label,
          attributes,
          Number(stock) || 0,
          Number(price_xpf),
          stripe_price_id,
          image_file || null,
          isTrue(active),
          isTrue(is_default),
          size,
          gender || 'UNISEXE',
          color
        ]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Import terminé avec succès');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Import échoué', err);
  } finally {
    client.release();
    process.exit();
  }
}

run();
