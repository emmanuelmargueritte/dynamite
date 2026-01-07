// backend/src/routes/admin.products.routes.js
const express = require('express');
const { pool } = require('../utils/db');
const AppError = require('../errors/AppError');

const router = express.Router();

/* =========================================================
   Helpers
   ========================================================= */

function normalizeBullets(input) {
  if (input == null) return null;

  // Accept: array of strings OR newline-separated string
  if (Array.isArray(input)) {
    const out = input
      .map(x => (x == null ? '' : String(x).trim()))
      .filter(Boolean);
    return out;
  }

  if (typeof input === 'string') {
    const out = input
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    return out;
  }

  return [];
}

function normalizeCategoryIds(input) {
  if (input === undefined) return undefined; // no change
  if (input == null) return [];              // explicit reset

  if (Array.isArray(input)) {
    const out = [];
    const seen = new Set();
    for (const id of input) {
      if (!id) continue;
      const s = String(id).trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  // single id
  const s = String(input).trim();
  return s ? [s] : [];
}

/* =========================================================
   Admin products list
   GET /api/admin/products
   - Par défaut: actifs uniquement
   - Option: ?all=1 pour tout afficher (actifs + inactifs)
   ========================================================= */
router.get('/', async (req, res, next) => {
  try {
    const all = req.query.all === '1';

    const result = await pool.query(
      `
      SELECT
        p.*,
        COALESCE(cats.categories, '[]'::jsonb) AS categories
      FROM products p
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'slug', c.slug,
                'sort_order', c.sort_order,
                'active', c.active
              )
              ORDER BY c.sort_order ASC, c.name ASC
            ),
            '[]'::jsonb
          ) AS categories
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = p.id
      ) cats ON true
      WHERE ($1::boolean = true) OR (p.active = true)
      ORDER BY p.created_at DESC
      `,
      [all]
    );

    res.json({ status: 'ok', products: result.rows });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   Create product
   POST /api/admin/products
   ========================================================= */
router.post('/', async (req, res, next) => {
  try {
    const name = req.body.name;
    const description = req.body.description;
    const price_xpf = req.body.price_xpf;
    const stripe_price_id = req.body.stripe_price_id;
    const image_url = req.body.image_url || null;

    // SEO / contenu
    const seo_title = req.body.seo_title ? String(req.body.seo_title) : null;
    const seo_description = req.body.seo_description ? String(req.body.seo_description) : null;
    const long_description = req.body.long_description ? String(req.body.long_description) : null;

    let bullet_points = req.body.bullet_points !== undefined ? req.body.bullet_points : null;
    if (bullet_points !== null) bullet_points = normalizeBullets(bullet_points);

    if (!name) throw new AppError('NAME_REQUIRED', 400, 'Nom requis');

    const result = await pool.query(
      `
      INSERT INTO products (
        id,
        name, description, price_xpf, stripe_price_id, image_url, active,
        seo_title, seo_description, long_description, bullet_points
      )
      VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, true,
        $6, $7, $8, $9::jsonb
      )
      RETURNING *
      `,
      [
        String(name).trim(),
        String(description || ''),
        Number(price_xpf || 0),
        String(stripe_price_id || '').trim(),
        image_url ? String(image_url) : null,
        seo_title,
        seo_description,
        long_description,
        JSON.stringify(bullet_points || [])
      ]
    );

    res.json({ status: 'ok', product: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   Categories endpoints used by admin JS
   GET /api/admin/products/categories
   POST /api/admin/products/categories
   DELETE /api/admin/products/categories/:id?force=1
   ========================================================= */

router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        c.*,
        COALESCE(used.used_by_products, 0) AS used_by_products
      FROM categories c
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS used_by_products
        FROM product_categories pc
        WHERE pc.category_id = c.id
      ) used ON true
      ORDER BY c.sort_order ASC, c.name ASC
      `
    );

    res.json({ status: 'ok', categories: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const name = req.body?.name ? String(req.body.name).trim() : '';
    if (!name) throw new AppError('CATEGORY_NAME_REQUIRED', 400, 'Nom de catégorie requis');

    // slug simple
    const slug = name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // sort_order: max + 1
    const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories`);
    const sort_order = Number(maxRows?.[0]?.max || 0) + 1;

    const { rows } = await pool.query(
      `
      INSERT INTO categories (id, name, slug, sort_order, active)
      VALUES (gen_random_uuid(), $1, $2, $3, true)
      RETURNING *
      `,
      [name, slug, sort_order]
    );

    res.json({ status: 'ok', category: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  const id = String(req.params.id);
  const force = req.query.force === '1';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: usedRows } = await client.query(
      `SELECT COUNT(*)::int AS used FROM product_categories WHERE category_id=$1`,
      [id]
    );
    const used = usedRows?.[0]?.used || 0;

    if (used > 0 && !force) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        status: 'error',
        code: 'CATEGORY_IN_USE',
        message: 'Catégorie utilisée par des produits',
        used
      });
    }

    if (force) {
      await client.query(`DELETE FROM product_categories WHERE category_id=$1`, [id]);
    }

    await client.query(`DELETE FROM categories WHERE id=$1`, [id]);

    await client.query('COMMIT');
    res.json({ status: 'ok', deleted: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/* =========================================================
   Update product
   PATCH /api/admin/products/:id
   ========================================================= */
router.patch('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = String(req.params.id);

    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    const description = req.body.description !== undefined ? String(req.body.description) : undefined;
    const price_xpf = req.body.price_xpf !== undefined ? Number(req.body.price_xpf) : undefined;
    const stripe_price_id = req.body.stripe_price_id !== undefined ? String(req.body.stripe_price_id).trim() : undefined;
    const image_url = req.body.image_url !== undefined ? (req.body.image_url ? String(req.body.image_url) : null) : undefined;
    const active = req.body.active !== undefined ? Boolean(req.body.active) : undefined;

    // ✅ Featured (sélection du moment sur la home)
    let is_featured = req.body.is_featured !== undefined ? Boolean(req.body.is_featured) : undefined;
    let featured_rank = req.body.featured_rank !== undefined ? req.body.featured_rank : undefined;

    // Validation / normalisation
    if (featured_rank !== undefined) {
      if (featured_rank === null || featured_rank === '' || featured_rank === false) {
        featured_rank = null;
      } else {
        const n = Number(featured_rank);
        if (!Number.isInteger(n) || n < 1) {
          throw new AppError('FEATURED_RANK_INVALID', 400, 'featured_rank invalide (entier >= 1)');
        }
        featured_rank = n;
        if (is_featured === undefined) is_featured = true; // rank => featured
      }
    }
    if (is_featured === false) {
      featured_rank = null; // si on retire le "featured", on supprime le rank
    }

    // ✅ SEO / contenu (CORRIGÉ)
    const seo_title = req.body.seo_title !== undefined ? (req.body.seo_title ? String(req.body.seo_title) : null) : undefined;
    const seo_description = req.body.seo_description !== undefined ? (req.body.seo_description ? String(req.body.seo_description) : null) : undefined;
    const long_description = req.body.long_description !== undefined ? (req.body.long_description ? String(req.body.long_description) : null) : undefined;

    let bullet_points = req.body.bullet_points !== undefined ? req.body.bullet_points : undefined;
    if (bullet_points !== undefined) bullet_points = normalizeBullets(bullet_points);

    // ✅ catégories
    const catIds = normalizeCategoryIds(req.body.category_ids);

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description=$${i++}`); values.push(description); }
    if (Number.isFinite(price_xpf)) { fields.push(`price_xpf=$${i++}`); values.push(price_xpf); }
    if (stripe_price_id !== undefined) { fields.push(`stripe_price_id=$${i++}`); values.push(stripe_price_id); }
    if (image_url !== undefined) { fields.push(`image_url=$${i++}`); values.push(image_url); }
    if (active !== undefined) { fields.push(`active=$${i++}`); values.push(active); }

    if (is_featured !== undefined) { fields.push(`is_featured=$${i++}`); values.push(is_featured); }
    if (featured_rank !== undefined) { fields.push(`featured_rank=$${i++}`); values.push(featured_rank); }

    if (seo_title !== undefined) { fields.push(`seo_title=$${i++}`); values.push(seo_title); }
    if (seo_description !== undefined) { fields.push(`seo_description=$${i++}`); values.push(seo_description); }
    if (long_description !== undefined) { fields.push(`long_description=$${i++}`); values.push(long_description); }
    if (bullet_points !== undefined) { fields.push(`bullet_points=$${i++}::jsonb`); values.push(JSON.stringify(bullet_points)); }

    const mustUpdateProduct = fields.length > 0;
    const mustSyncCats = Array.isArray(catIds);

    if (!mustUpdateProduct && !mustSyncCats) {
      return res.json({ status: 'ok', product: null });
    }

    await client.query('BEGIN');

    let updatedProduct = null;

    if (mustUpdateProduct) {
      values.push(id);
      const result = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
        values
      );
      if (!result.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produit introuvable' });
      }
      updatedProduct = result.rows[0];

      // 🔁 Sync variantes si prix / stripe changent
      if (price_xpf !== undefined || stripe_price_id !== undefined) {
        await client.query(
          `
          UPDATE product_variants
          SET price_xpf = $2,
              stripe_price_id = $3
          WHERE product_id = $1
          `,
          [id, updatedProduct.price_xpf, updatedProduct.stripe_price_id]
        );
      }
    } else {
      // si on ne patch pas products, on check quand même que le produit existe
      const { rows } = await client.query(`SELECT * FROM products WHERE id=$1`, [id]);
      if (!rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Produit introuvable' });
      }
      updatedProduct = rows[0];
    }

    // ✅ Catégories: remplacer entièrement si category_ids fourni
    if (mustSyncCats) {
      await client.query(`DELETE FROM product_categories WHERE product_id=$1`, [id]);

      if (catIds.length) {
        // vérifier que les catégories existent
        const { rows: catRows } = await client.query(
          `SELECT id FROM categories WHERE id = ANY($1::uuid[])`,
          [catIds]
        );
        const found = new Set(catRows.map(r => r.id));
        const toInsert = catIds.filter(x => found.has(x));

        for (const cid of toInsert) {
          await client.query(
            `INSERT INTO product_categories (product_id, category_id) VALUES ($1, $2)`,
            [id, cid]
          );
        }
      }
    }

    // renvoyer les catégories à jour
    const { rows: catsRows } = await client.query(
      `
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'sort_order', c.sort_order)
          ORDER BY c.sort_order ASC, c.name ASC
        ),
        '[]'::jsonb
      ) AS categories
      FROM product_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.product_id = $1 AND c.active = true
      `,
      [id]
    );

    await client.query('COMMIT');

    res.json({
      status: 'ok',
      product: {
        ...updatedProduct,
        categories: catsRows?.[0]?.categories || []
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/* =========================================================
   Delete product (soft delete)
   DELETE /api/admin/products/:id
   ========================================================= */
router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = String(req.params.id);

    await client.query('BEGIN');

    // Désactiver les variantes liées (si table/relations existent)
    await client.query(
      `UPDATE product_variants SET active = false WHERE product_id = $1`,
      [id]
    );

    // Désactiver le produit (soft delete)
    const { rows } = await client.query(
      `UPDATE products
       SET active = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Produit introuvable' });
    }

    await client.query('COMMIT');
    return res.json({ status: 'ok', product: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    client.release();
  }
});

/* =========================================================
   Toggle product active
   PATCH /api/admin/products/:id/toggle
   ========================================================= */
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { rows } = await pool.query(
      `UPDATE products SET active = NOT active, updated_at = NOW() WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable' });

    res.json({ status: 'ok', product: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
