const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();

// Controllers
const { getAllProducts, getAllProductsList, getNearbyProducts, getPendingProducts, getProductById, scanQRCode, searchProductsByNameAndLocation } = require('../controllers/productGet');
const { addProduct } = require('../controllers/productAdd');
const { updateProduct, deleteProduct } = require('../controllers/productUpdate');
const { approveProduct } = require('../controllers/productApproval');
const { getAllDailyOffers, getVendorDailyOffers, toggleProductOffer } = require('../controllers/productOffer');

// Middleware
const { protect } = require('../middleware/adminAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');
const { protectVendorOrAdmin } = require('../middleware/vendorOrAdminAuth');
const { uploadMultiple } = require('../middleware/productUpload');
const { optionalUser } = require('../middleware/optionalUser');
const { parseClientLatLon } = require('../utils/distanceUtils');

// Public Routes
// Search products by name and location (Public - no authentication required)
// This endpoint searches for products whose name contains the search term and filters by nearby location
router.get(
  '/search',
  [
    query('latitude')
      .optional()
      .bail()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .optional()
      .bail()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    query('lat')
      .optional()
      .bail()
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be between -90 and 90'),
    query('lng')
      .optional()
      .bail()
      .isFloat({ min: -180, max: 180 })
      .withMessage('lng must be between -180 and 180'),
    query('search')
      .notEmpty()
      .withMessage('Search term is required')
      .bail()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters')
      .custom((_, { req }) => {
        if (!parseClientLatLon(req.query)) {
          throw new Error('Provide latitude & longitude, or lat & lng');
        }
        return true;
      }),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage('Radius must be between 0.1 and 100 kilometers'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  searchProductsByNameAndLocation
);

// Get approved products with optional location filtering (Public - no authentication required)
router.get(
  '/',
  optionalUser,
  [
    query('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be between -90 and 90'),
    query('lng')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('lng must be between -180 and 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage('Radius must be between 0.1 and 100 kilometers'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  getNearbyProducts
);

router.get(
  '/daily-offers',
  [
    query('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    query('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be between -90 and 90'),
    query('lng')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('lng must be between -180 and 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage('Radius must be between 0.1 and 100 kilometers'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
    query('vendorId')
      .optional()
      .isMongoId()
      .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
  ],
  getAllDailyOffers
);

router.get(
  '/vendors/:vendorId/daily-offers',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getVendorDailyOffers
);

// Update daily offer (Vendor only - can only update their own products)
router.put(
  '/daily-offers/:productId',
  protectVendor,
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
    body('offerEnabled')
      .optional()
      .isBoolean()
      .withMessage('offerEnabled must be a boolean'),
    body('offerDiscountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount percentage must be between 0 and 100'),
    body('offerStartDate')
      .optional()
      .custom((value) => {
        if (value === null || value === '') return true;
        const date = new Date(value);
        return !isNaN(date.getTime());
      })
      .withMessage('Start date must be a valid date (ISO8601 or YYYY-MM-DD)'),
    body('offerStartTime')
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
      .withMessage('Start time must be in HH:MM or HH:MM:SS format (24-hour)'),
    body('offerEndDate')
      .optional()
      .custom((value) => {
        if (value === null || value === '') return true;
        const date = new Date(value);
        return !isNaN(date.getTime());
      })
      .withMessage('End date must be a valid date (ISO8601 or YYYY-MM-DD)'),
    body('offerEndTime')
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
      .withMessage('End time must be in HH:MM or HH:MM:SS format (24-hour)'),
    body('isDailyOffer')
      .optional()
      .isBoolean()
      .withMessage('isDailyOffer must be a boolean'),
  ],
  toggleProductOffer
);

// Admin Routes
// Get all products list - simplified view (Admin only)
router.get(
  '/admin/list',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Approval status must be pending, approved, or rejected'),
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  getAllProductsList
);

// Get pending products (Admin only)
router.get(
  '/pending',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  getPendingProducts
);

// Get all products (Admin only) - with filtering options
router.get(
  '/all',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Approval status must be pending, approved, or rejected'),
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  getAllProducts
);

// Vendor Routes (specific routes first to avoid conflicts)
// Create product (Vendor or Admin) - Products are created with 'pending' approval status
const createProductValidation = [
  body('vendorId')
    .optional()
    .isMongoId()
    .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
  body('productName')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .bail()
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),
  body('productType')
    .notEmpty()
    .withMessage('Product type is required')
    .bail()
    .isIn(['quantity', 'weight', 'volume'])
    .withMessage('Product type must be quantity, weight, or volume'),
  body('productTypeValue')
    .notEmpty()
    .withMessage('Product type value is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Product type value must be a number greater than or equal to 0'),
  body('productTypeUnit')
    .trim()
    .notEmpty()
    .withMessage('Product type unit is required'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .bail()
    .isMongoId()
    .withMessage('Category must be a valid MongoDB ObjectId'),
  body('subCategory')
    .notEmpty()
    .withMessage('SubCategory is required')
    .bail()
    .isMongoId()
    .withMessage('SubCategory must be a valid MongoDB ObjectId'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('skuHsn')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('SKU/HSN code cannot exceed 50 characters'),
  body('inventory')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Inventory must be a number greater than or equal to 0'),
  body('actualPrice')
    .notEmpty()
    .withMessage('Actual price is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Actual price must be a number greater than or equal to 0'),
  body('regularPrice')
    .notEmpty()
    .withMessage('Regular price is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Regular price must be a number greater than or equal to 0'),
  body('salePrice')
    .notEmpty()
    .withMessage('Sale price is required')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Sale price must be a number greater than or equal to 0'),
  body('cashback')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cashback must be a number greater than or equal to 0'),
  body('tax')
    .notEmpty()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax must be a percentage between 0 and 100'),
  body('tags')
    .optional()
    .trim()
    .custom((value) => {
      if (typeof value === 'string') {
        const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        if (tags.length > 20) {
          throw new Error('Maximum 20 tags allowed');
        }
      }
      return true;
    }),
];

// Create product endpoint (Vendor or Admin)
router.post(
  '/create',
  protectVendorOrAdmin,
  uploadMultiple,
  createProductValidation,
  addProduct
);

// Add product endpoint (Vendor or Admin) - Alias for /create
router.post(
  '/add',
  protectVendorOrAdmin,
  uploadMultiple,
  createProductValidation,
  addProduct
);

// Update product (Vendor or Admin - vendors can only update their own products)
router.put(
  '/update/:id',
  protectVendorOrAdmin,
  uploadMultiple,
  [
    body('productName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Product name cannot be empty')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Product name cannot exceed 200 characters'),
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
      .withMessage('Category must be a valid MongoDB ObjectId'),
    body('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Description cannot exceed 5000 characters'),
    body('skuHsn')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('SKU/HSN code cannot exceed 50 characters'),
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
    body('tax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Tax must be a number greater than or equal to 0'),
    body('handlingCharge')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Handling charge must be a number greater than or equal to 0'),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('tags')
      .optional()
      .trim()
      .custom((value) => {
        if (typeof value === 'string') {
          const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tags.length > 20) {
            throw new Error('Maximum 20 tags allowed');
          }
        }
        return true;
      }),
  ],
  updateProduct
);

// Delete product (Vendor only - can only delete their own products)
router.delete('/vendor/:id', protectVendor, deleteProduct);

// Admin Routes (after vendor routes to avoid conflicts)
// Approve product (Admin only)
router.put(
  '/approve/:id',
  protect,
  approveProduct
);

// Reject product (Admin only)
router.put(
  '/reject/:id',
  protect,
  [
    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot exceed 500 characters'),
  ],
  approveProduct
);

// Update product (Admin only)
router.put(
  '/admin/:id',
  protect,
  uploadMultiple,
  [
    body('productName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Product name cannot be empty')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Product name cannot exceed 200 characters'),
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
      .withMessage('Category must be a valid MongoDB ObjectId'),
    body('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Description cannot exceed 5000 characters'),
    body('skuHsn')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('SKU/HSN code cannot exceed 50 characters'),
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
    body('tax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Tax must be a number greater than or equal to 0'),
    body('handlingCharge')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Handling charge must be a number greater than or equal to 0'),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('tags')
      .optional()
      .trim()
      .custom((value) => {
        if (typeof value === 'string') {
          const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tags.length > 20) {
            throw new Error('Maximum 20 tags allowed');
          }
        }
        return true;
      }),
  ],
  updateProduct
);

// Delete product (Admin only)
router.delete('/admin/:id', protect, deleteProduct);

// Scan QR code to check if product exists (Vendor only - vendor ID extracted from credentials)
router.post(
  '/scan-qr',
  protectVendor,
  [
    body('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
    body('sku')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('SKU must be between 1 and 100 characters'),
  ],
  scanQRCode
);

// Get single product by ID (Public - returns approved products only)
// Must be placed after all specific routes to avoid conflicts
router.get('/:id', getProductById);

module.exports = router;
