const Product = require('../models/product.model');
const { env } = require('../utils/env');

module.exports = {
  async listProducts(req, res) {
    const products = await Product.getPublicList();
    return res.json({ products });
  },

  async getProduct(req, res) {
    const id = String(req.params.id);
    const product = await Product.getPublicByIdWithDetails(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({ product });
  },

  async getStoreInfo(req, res) {
    return res.json({
      store: { name: env.STORE_NAME, address: env.STORE_ADDRESS },
      delivery: {
        enabled: env.DELIVERY_ENABLED,
        zoneName: env.DELIVERY_ZONE_NAME,
        fee_xpf: env.DELIVERY_FEE_XPF,
        free_threshold_xpf: env.DELIVERY_FREE_THRESHOLD_XPF
      },
      clickAndCollect: { enabled: env.CLICK_AND_COLLECT_ENABLED }
    });
  }
};
