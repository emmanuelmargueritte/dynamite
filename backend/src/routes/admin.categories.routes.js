// backend/src/routes/admin.categories.routes.js
const express = require('express');
const { pool } = require('../utils/db');

const router = express.Router();

/* ---------------- helpers ---------------- */
function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')                 // enlève accents (≈)
    .replace(/[\u0300-\u036f]/g, '')   // diacritiques
    .replace(/[^a-z0-9]+/g, '-')       // tout le reste -> -
    .replace(/^-+|-+$/g, '')           // trim -
    .replace(/-+/g, '-');              // collapse
}

/* ---------------- routes ---------------- */

/**
 * GET /api/admin/categories
 * Liste complète (actives + inactives) + count produits (actifs)
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.sort_order,
        c.active,
        c.created_at,
        COALESCE(pc.product_count, 0)::int AS product_count
      FROM categories c
      LEFT JOIN (
        SELECT
          pc.category_id,
          COUNT(DISTINCT pc.product_id) AS product_count
        FROM product_categories pc
        JOIN products p ON p.id = pc.product_id
        WHERE p.active = true
        GROUP BY pc.category_id
      ) pc ON pc.category_id = c.id
      ORDER BY c.sort_order ASC, c.name ASC
      `
    );
    res.json({ status: 'ok', categories: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/categories
 * body: { name, slug?, sort_order?, active? }
 */
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    let slug = String(req.body.slug || '').trim();
    const sort_order = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0;
    const active = req.body.active === undefined ? true : Boolean(req.body.active);

    if (!name) return res.status(400).json({ error: 'name is required' });

    if (!slug) slug = slugify(name);
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const { rows } = await pool.query(
      `
      INSERT INTO categories (id, name, slug, sort_order, active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4)
      RETURNING id, name, slug, sort_order, active, created_at
      `,
      [name, slug, sort_order, active]
    );

    res.status(201).json({ status: 'ok', category: rows[0] });
  } catch (err) {
    // violations UNIQUE -> 409
    if (String(err?.code) === '23505') {
      return res.status(409).json({ error: 'Category name or slug already exists' });
    }
    next(err);
  }
});

/**
 * PATCH /api/admin/categories/:id
 * body: { name?, slug?, sort_order?, active? }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);

    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : undefined;
    let slug = req.body.slug !== undefined ? String(req.body.slug || '').trim() : undefined;
    const sort_order = req.body.sort_order !== undefined ? Number(req.body.sort_order) : undefined;
    const active = req.body.active !== undefined ? Boolean(req.body.active) : undefined;

    if (slug !== undefined && !slug) {
      // si on vide slug explicitement -> recalcul si name présent, sinon erreur
      if (name) slug = slugify(name);
      if (!slug) return res.status(400).json({ error: 'slug is required' });
    }

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
    if (slug !== undefined) { fields.push(`slug=$${i++}`); values.push(slug); }
    if (sort_order !== undefined && Number.isFinite(sort_order)) { fields.push(`sort_order=$${i++}`); values.push(sort_order); }
    if (active !== undefined) { fields.push(`active=$${i++}`); values.push(active); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);

    const { rows } = await pool.query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id=$${i} RETURNING id, name, slug, sort_order, active, created_at`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'Category not found' });

    res.json({ status: 'ok', category: rows[0] });
  } catch (err) {
    if (String(err?.code) === '23505') {
      return res.status(409).json({ error: 'Category name or slug already exists' });
    }
    next(err);
  }
});

/**
 * DELETE /api/admin/categories/:id
 * Soft delete: active=false (maintenable + évite pertes)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);

    const { rows } = await pool.query(
      `UPDATE categories SET active=false WHERE id=$1 RETURNING id`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Category not found' });

    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
