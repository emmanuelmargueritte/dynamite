// backend/src/routes/public.categories.routes.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { pool } = require('../utils/db');

const router = express.Router();

/**
 * GET /api/public/categories
 * Liste des catégories actives + count de produits actifs associés
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.sort_order,
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
      WHERE c.active = true
      ORDER BY c.sort_order ASC, c.name ASC
      `
    );

    res.json({ status: 'ok', categories: rows });
  })
);

module.exports = router;
