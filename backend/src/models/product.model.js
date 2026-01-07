// backend/src/models/product.model.js
const { pool } = require('../utils/db');
const Cloudinary = require('../services/cloudinaryService');

const MAX_STOCK = 2147483647;

function normStr(x) {
  return String(x ?? '').trim();
}

function normColors(colors) {
  if (!Array.isArray(colors)) return [];
  return colors.map(normStr).filter(Boolean);
}

function normSizes(sizes) {
  if (!Array.isArray(sizes)) return [];
  return sizes.map(normStr).filter(Boolean);
}

module.exports = {
  // ✅ Liste produits publics (simple)
  async getPublicList() {
    const { rows } = await pool.query(
      `
      SELECT
        id, name, description,
        price_xpf, stripe_price_id, image_url,
        active, created_at
      FROM products
      WHERE active = true
      ORDER BY created_at DESC
      `
    );
    return rows;
  },

  // ✅ Détail produit public + variantes actives + default (utile si un jour tu veux une page produit)
  async getPublicByIdWithDetails(id) {
    const { rows } = await pool.query(
      `
      WITH p AS (
        SELECT id, name, description, price_xpf, stripe_price_id, image_url, active, created_at
        FROM products
        WHERE id = $1 AND active = true
        LIMIT 1
      ),
      variants AS (
        SELECT
          v.id,
          v.product_id,
          v.label,
          v.size,
          v.color,
          v.gender,
          v.price_xpf,
          v.stripe_price_id,
          v.image_url,
          v.stock,
          v.is_default,
          v.active
        FROM product_variants v
        JOIN p ON p.id = v.product_id
        WHERE v.active = true
      )
      SELECT
        p.*,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', id,
              'label', label,
              'size', size,
              'color', color,
              'gender', gender,
              'price_xpf', price_xpf,
              'stripe_price_id', stripe_price_id,
              'image_url', image_url,
              'stock', stock,
              'is_default', is_default,
              'active', active
            )
            ORDER BY is_default DESC, gender, color, size
          ) FROM variants),
          '[]'::json
        ) AS variants
      FROM p
      `
      ,
      [id]
    );
    return rows[0] || null;
  },

  // ✅ Liste admin (simple, alignée à ton tableau)
  async getAdminList() {
    const { rows } = await pool.query(
      `
      SELECT
        id, name, description,
        price_xpf, stripe_price_id, image_url,
        active, created_at
      FROM products
      ORDER BY created_at DESC
      `
    );
    return rows;
  },

  /**
   * ✅ Option A :
   * - crée le produit
   * - crée la variante default (toujours)
   * - génère variantes (couleurs/tailles) si fourni, mais INACTIVES (sauf default)
   * - stock global optionnel :
   *    - track=false => stock illimité (MAX_INT)
   *    - track=true & total=null => 0 (rupture tant que non renseigné)
   *    - track=true & total=int => cette valeur
   */
  async createWithPreset({
    name,
    description,
    price_xpf,
    stripe_price_id,
    image_url,
    active = true,
    preset = {},
    stock = {}
  }) {
    const gender = normStr(preset.gender) || 'UNISEXE';
    const colors = normColors(preset.colors);
    const sizes = normSizes(preset.sizes);

    const trackStock = Boolean(stock.track);
    const stockTotal = (stock.total === null || stock.total === undefined) ? null : Number(stock.total);

    const stockValue = trackStock
      ? (Number.isInteger(stockTotal) ? stockTotal : 0)
      : MAX_STOCK;

    const BASE_COLOR = 'DEFAULT';
    const BASE_SIZE = 'M';

    const finalColors = colors.length ? colors : [BASE_COLOR];
    const finalSizes = sizes.length ? sizes : [BASE_SIZE];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Product
      const { rows: prodRows } = await client.query(
        `
        INSERT INTO products
          (name, description, price_xpf, stripe_price_id, image_url, active, created_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,NOW(),NOW())
        RETURNING id, name, description, price_xpf, stripe_price_id, image_url, active, created_at
        `,
        [name, description, price_xpf, stripe_price_id, image_url, active]
      );
      const product = prodRows[0];

      // 2) Default variant (toujours)
      const { rows: defRows } = await client.query(
        `
        INSERT INTO product_variants
          (product_id, label, size, color, gender, price_xpf, stripe_price_id, image_url, stock, is_default, active, created_at, updated_at)
        VALUES
          ($1, 'Standard', $2, $3, $4, $5, $6, $7, $8, true, true, NOW(), NOW())
        RETURNING id
        `,
        [product.id, BASE_SIZE, BASE_COLOR, gender, price_xpf, stripe_price_id, image_url, stockValue]
      );
      const defaultVariantId = defRows[0].id;

      // 3) Variantes générées (optionnel) — INACTIVES
      for (const c of finalColors) {
        for (const s of finalSizes) {
          const isDefaultCombo = (c === BASE_COLOR && s === BASE_SIZE);
          if (isDefaultCombo) continue;

          await client.query(
            `
            INSERT INTO product_variants
              (product_id, label, size, color, gender, price_xpf, stripe_price_id, image_url, stock, is_default, active, created_at, updated_at)
            VALUES
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false,NOW(),NOW())
            ON CONFLICT (product_id, size, color, gender) DO NOTHING
            `,
            [
              product.id,
              `${c} / ${s}`,
              s,
              c,
              gender,
              price_xpf,
              stripe_price_id,
              image_url,
              stockValue
            ]
          );
        }
      }

      await client.query('COMMIT');
      return { product, default_variant_id: defaultVariantId };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async update(id, patch) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [k, v] of Object.entries(patch || {})) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }

    if (!fields.length) {
      const { rows } = await pool.query(
        `SELECT id, name, description, price_xpf, stripe_price_id, image_url, active, created_at
         FROM products WHERE id=$1`,
        [id]
      );
      return rows[0] || null;
    }

    values.push(id);

    const { rows } = await pool.query(
      `
      UPDATE products
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, name, description, price_xpf, stripe_price_id, image_url, active, created_at
      `,
      values
    );
    return rows[0] || null;
  },

  async delete(id, { deleteCloudinary }) {
    if (deleteCloudinary) {
      const { rows } = await pool.query(`SELECT image_url FROM products WHERE id=$1`, [id]);
      if (rows[0]?.image_url) await Cloudinary.deleteByUrl(rows[0].image_url);
    }
    const { rowCount } = await pool.query(`DELETE FROM products WHERE id=$1`, [id]);
    return rowCount === 1;
  }
};
