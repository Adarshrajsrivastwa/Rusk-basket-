const express = require('express');
const { body, query } = require('express-validator');
const { addProduct } = require('../controllers/productAdd');
const { getProducts, getProduct, getPendingProducts } = require('../controllers/productGet');
const { updateProduct, deleteProduct } = require('../controllers/productUpdate');
const { approveProduct } = require('../controllers/productApproval');
const { protect } = require('../middleware/vendorAuth');
const { protect: protectAdmin } = require('../middleware/adminAuth');
const { protectVendorOrAdmin } = require('../middleware/productAuth');
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
      .notEmpty()
      .withMessage('Sale price is required')
      .isFloat({ min: 0 })
      .withMessage('Sale price must be a number greater than or equal to 0'),
    body('cashback')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cashback must be a number greater than or equal to 0'),
    body('skuHsn')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('SKU/HSN code cannot be more than 50 characters'),
    body('inventory')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Inventory must be a number greater than or equal to 0'),
    body('tags')
      .trim()
      .notEmpty()
      .withMessage('Tags are required')
      .custom((value) => {
        if (typeof value === 'string') {
          const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tags.length === 0) {
            throw new Error('At least one tag is required');
          }
          if (tags.length > 20) {
            throw new Error('Maximum 20 tags allowed');
          }
          return true;
        }
        return false;
      })
      .withMessage('Tags must be comma-separated values'),
  ],
  addProduct
);

router.get(
  '/',
  [
    query('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be a number between -90 and 90'),
    query('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be a number between -180 and 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 1000 })
      .withMessage('Radius must be a number between 0.1 and 1000 km'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getProducts
);

router.get('/pending', protectAdmin, getPendingProducts);

router.get('/:id', getProduct);

router.put(
  '/:id',
  protectVendorOrAdmin,
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

router.delete('/:id', protectVendorOrAdmin, deleteProduct);

router.put('/:id/approve', protectAdmin, approveProduct);

router.put('/:id/reject', protectAdmin, [
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Rejection reason cannot be more than 500 characters'),
], approveProduct);

module.exports = router;

