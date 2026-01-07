const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authRequired = require('../middlewares/authRequired');
const auditLog = require('../middlewares/auditLog');
const ProductController = require('../controllers/productController');

const router = express.Router();

router.post('/', authRequired, auditLog('PRODUCT_CREATE'), asyncHandler(ProductController.createProduct));
router.put('/:id', authRequired, auditLog('PRODUCT_UPDATE'), asyncHandler(ProductController.updateProduct));
router.delete('/:id', authRequired, auditLog('PRODUCT_DELETE'), asyncHandler(ProductController.deleteProduct));

router.post('/:id/images', authRequired, auditLog('PRODUCT_IMAGE_ADD'), asyncHandler(ProductController.addProductImage));
router.delete('/:id/images/:imageId', authRequired, auditLog('PRODUCT_IMAGE_DELETE'), asyncHandler(ProductController.deleteProductImage));

router.post('/:id/variants', authRequired, auditLog('PRODUCT_VARIANT_UPSERT'), asyncHandler(ProductController.upsertVariant));
router.delete('/:id/variants/:variantId', authRequired, auditLog('PRODUCT_VARIANT_DELETE'), asyncHandler(ProductController.deleteVariant));

router.get('/admin/list', authRequired, asyncHandler(ProductController.adminList));

module.exports = router;
