// backend/src/controllers/productController.js
const Product = require('../models/product.model');
const { assertIntXpf } = require('../utils/amounts');

module.exports = {
  async adminList(req, res) {
    const products = await Product.getAdminList();
    return res.json(products); // ✅ tableau direct
  },

  async createProduct(req, res) {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const price_xpf = assertIntXpf(req.body.price_xpf, 'price_xpf');
    const stripe_price_id = String(req.body.stripe_price_id || '').trim();
    const image_url = req.body.image_url ? String(req.body.image_url).trim() : null;

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!stripe_price_id) return res.status(400).json({ error: 'stripe_price_id is required' });

    const preset = req.body.preset || {};
    const stock = req.body.stock || {};

    try {
      const result = await Product.createWithPreset({
        name,
        description,
        price_xpf,
        stripe_price_id,
        image_url,
        active: true,
        preset,
        stock
      });

      return res.status(201).json(result);
    } catch (e) {
      console.error('createProduct failed:', e);
      return res.status(500).json({ error: 'createProduct failed' });
    }
  },

  async updateProduct(req, res) {
    const id = String(req.params.id);
    const patch = {};

    if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
    if (req.body.description !== undefined) patch.description = String(req.body.description).trim();
    if (req.body.price_xpf !== undefined) patch.price_xpf = assertIntXpf(req.body.price_xpf, 'price_xpf');
    if (req.body.stripe_price_id !== undefined) patch.stripe_price_id = String(req.body.stripe_price_id).trim();
    if (req.body.image_url !== undefined) patch.image_url = req.body.image_url ? String(req.body.image_url).trim() : null;
    if (req.body.active !== undefined) patch.active = Boolean(req.body.active);

    const updated = await Product.update(id, patch);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    return res.json({ product: updated });
  },

  async deleteProduct(req, res) {
    const id = String(req.params.id);
    const deleteCloudinary = Boolean(req.body?.delete_cloudinary);

    const ok = await Product.delete(id, { deleteCloudinary });
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    return res.json({ ok: true });
  }
};
