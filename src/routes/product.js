const express = require('express');
const { body } = require('express-validator');
const { addProduct } = require('../controllers/productAdd');
const { getProducts, getProduct, getPendingProducts } = require('../controllers/productGet');
const { updateProduct, deleteProduct } = require('../controllers/productUpdate');
const { approveProduct } = require('../controllers/productApproval');
const { protect } = require('../middleware/vendorAuth');
const { protect: protectSuperAdmin } = require('../middleware/superadminAuth');
const { protectVendorOrSuperAdmin } = require('../middleware/productAuth');
const { uploadMultiple } = require('../middleware/productUpload');

const router = express.Router();

router.post(
  '/add',
  protect,
  uploadMultiple,
  [
    body('productName')
      .trim()
      .notEmpty()
      .withMessage('Product name is required')
      .isLength({ max: 200 })
      .withMessage('Product name cannot be more than 200 characters'),
    body('productType')
      .isIn(['quantity', 'weight', 'volume'])
      .withMessage('Product type must be quantity, weight, or volume'),
    body('productTypeValue')
      .notEmpty()
      .withMessage('Product type value is required')
      .isFloat({ min: 0 })
      .withMessage('Product type value must be a number greater than or equal to 0'),
    body('productTypeUnit')
      .trim()
      .notEmpty()
      .withMessage('Product type unit is required'),
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .isMongoId()
      .withMessage('Invalid category ID'),
    body('subCategory')
      .notEmpty()
      .withMessage('Sub category is required')
      .isMongoId()
      .withMessage('Invalid sub category ID'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Description cannot be more than 5000 characters'),
    body('skus')
      .optional()
      .custom((value) => {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          if (!Array.isArray(parsed)) return false;
          return parsed.every(sku => sku.sku && typeof sku.inventory === 'number' && sku.inventory >= 0);
        } catch {
          return false;
        }
      })
      .withMessage('SKUs must be a valid JSON array with sku and inventory fields'),
    body('inventory')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Inventory must be a number greater than or equal to 0'),
    body('actualPrice')
      .notEmpty()
      .withMessage('Actual price is required')
      .isFloat({ min: 0 })
      .withMessage('Actual price must be a number greater than or equal to 0'),
    body('regularPrice')
      .notEmpty()
      .withMessage('Regular price is required')
      .isFloat({ min: 0 })
      .withMessage('Regular price must be a number greater than or equal to 0'),
    body('salePrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Sale price must be a number greater than or equal to 0'),
    body('cashback')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cashback must be a number greater than or equal to 0'),
    body().custom((value, { req }) => {
      const hasSkus = req.body.skus && (() => {
        try {
          const parsed = typeof req.body.skus === 'string' ? JSON.parse(req.body.skus) : req.body.skus;
          return Array.isArray(parsed) && parsed.length > 0;
        } catch {
          return false;
        }
      })();
      const hasInventory = req.body.inventory !== undefined && req.body.inventory !== null && req.body.inventory !== '';
      if (!hasSkus && !hasInventory) {
        throw new Error('Either inventory or SKUs must be provided');
      }
      return true;
    }),
  ],
  addProduct
);

router.get('/', getProducts);

router.get('/pending', protectSuperAdmin, getPendingProducts);

router.get('/:id', getProduct);

router.put(
  '/:id',
  protectVendorOrSuperAdmin,
  uploadMultiple,
  [
    body('productName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Product name cannot be empty')
      .isLength({ max: 200 })
      .withMessage('Product name cannot be more than 200 characters'),
    body('productType')
      .optional()
      .isIn(['quantity', 'weight', 'volume'])
      .withMessage('Product type must be quantity, weight, or volume'),
    body('productTypeValue')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Product type value must be a number greater than or equal to 0'),
    body('productTypeUnit')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Product type unit cannot be empty'),
    body('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID'),
    body('subCategory')
      .optional()
      .isMongoId()
      .withMessage('Invalid sub category ID'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Description cannot be more than 5000 characters'),
    body('skus')
      .optional()
      .custom((value) => {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          if (!Array.isArray(parsed)) return false;
          return parsed.every(sku => sku.sku && typeof sku.inventory === 'number' && sku.inventory >= 0);
        } catch {
          return false;
        }
      })
      .withMessage('SKUs must be a valid JSON array with sku and inventory fields'),
    body('inventory')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Inventory must be a number greater than or equal to 0'),
    body('actualPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Actual price must be a number greater than or equal to 0'),
    body('regularPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Regular price must be a number greater than or equal to 0'),
    body('salePrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Sale price must be a number greater than or equal to 0'),
    body('cashback')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cashback must be a number greater than or equal to 0'),
    body('tags')
      .optional()
      .custom((value) => {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      })
      .withMessage('Tags must be a valid JSON array'),
  ],
  updateProduct
);

router.delete('/:id', protectVendorOrSuperAdmin, deleteProduct);

router.put('/:id/approve', protectSuperAdmin, approveProduct);

router.put('/:id/reject', protectSuperAdmin, [
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Rejection reason cannot be more than 500 characters'),
], approveProduct);

module.exports = router;

