const express = require('express');
const { query, body, param } = require('express-validator');
const {
  getVendorDashboard,
  getVendorSales,
  getVendorProductPerformance,
  getVendorOverview,
  getAdminDashboard,
  getAdminSales,
  getAdminVendorAnalytics,
  getAdminProductAnalytics,
  getAdminDashboardOverview,
  updateStock,
  getProductInventory,
  getAllInventory,
  getVendorProductsList,
  getVendorsWithRidersNoOrders,
  getProductSalesReport,
} = require('../controllers/analytics');
const { protect } = require('../middleware/adminAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');

const router = express.Router();

router.get(
  '/vendor/dashboard',
  protectVendor,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
  ],
  getVendorDashboard
);

router.get(
  '/vendor/sales',
  protectVendor,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('groupBy must be one of: day, week, month'),
  ],
  getVendorSales
);

router.get(
  '/vendor/products',
  protectVendor,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getVendorProductPerformance
);

// Vendor Overview Dashboard - Comprehensive metrics matching the dashboard design
router.get(
  '/vendor/overview',
  protectVendor,
  getVendorOverview
);

router.get(
  '/admin/dashboard',
  protect,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
  ],
  getAdminDashboard
);

router.get(
  '/admin/sales',
  protect,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('groupBy must be one of: day, week, month'),
    query('vendorId')
      .optional()
      .isMongoId()
      .withMessage('vendorId must be a valid MongoDB ObjectId'),
  ],
  getAdminSales
);

router.get(
  '/admin/vendors',
  protect,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getAdminVendorAnalytics
);

router.get(
  '/admin/products',
  protect,
  [
    query('period')
      .optional()
      .isIn(['today', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be one of: today, week, month, year, all'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getAdminProductAnalytics
);

// Comprehensive Admin Dashboard Overview - All metrics in one endpoint (Admin Only)
router.get(
  '/admin/dashboard/overview',
  protect,
  getAdminDashboardOverview
);

// Update inventory - Vendor can update their own products only
router.put(
  '/vendor/product/:productId/inventory',
  protectVendor,
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
    body('addedProduct')
      .notEmpty()
      .withMessage('Added product quantity is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Added product quantity must be a non-negative number'),
  ],
  updateStock
);

// Update stock - Alternative endpoint name (same functionality as inventory)
router.put(
  '/vendor/product/:productId/stock',
  protectVendor,
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
    body('addedProduct')
      .notEmpty()
      .withMessage('Added product quantity is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Added product quantity must be a non-negative number'),
  ],
  updateStock
);

// Get inventory for a specific product - Vendor can view their own, Admin can view any
router.get(
  '/vendor/product/:productId/inventory',
  protectVendor,
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
  ],
  getProductInventory
);

// Get inventory for a specific product - Admin can view any
router.get(
  '/admin/product/:productId/inventory',
  protect,
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),
  ],
  getProductInventory
);

// Get all inventory - Vendor can view their own products, Admin can view all
router.get(
  '/vendor/inventory',
  protectVendor,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('stockStatus')
      .optional()
      .isIn(['out_of_stock', 'low_stock', 'in_stock'])
      .withMessage('Stock status must be one of: out_of_stock, low_stock, in_stock'),
  ],
  getAllInventory
);

// Get all inventory - Admin can view all products
router.get(
  '/admin/inventory',
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
    query('stockStatus')
      .optional()
      .isIn(['out_of_stock', 'low_stock', 'in_stock'])
      .withMessage('Stock status must be one of: out_of_stock, low_stock, in_stock'),
  ],
  getAllInventory
);

// Get vendor products list - Table format with all product details
router.get(
  '/vendor/products/list',
  protectVendor,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('stockStatus')
      .optional()
      .isIn(['out_of_stock', 'low_stock', 'in_stock'])
      .withMessage('Stock status must be one of: out_of_stock, low_stock, in_stock'),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Approval status must be one of: pending, approved, rejected'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'productName', 'inventory', 'salePrice', 'regularPrice'])
      .withMessage('Sort by must be one of: createdAt, productName, inventory, salePrice, regularPrice'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be one of: asc, desc'),
  ],
  getVendorProductsList
);

// Get vendors with associated riders who have no current orders
router.get(
  '/vendor/riders/no-orders',
  protectVendor,
  getVendorsWithRidersNoOrders
);

// Get product sales report (GST compliance) - Vendor can view their own, Admin can view any
router.get(
  '/vendor/product-sales-report',
  protectVendor,
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
  ],
  getProductSalesReport
);

router.get(
  '/admin/product-sales-report',
  protect,
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
    query('vendorId').optional().isMongoId().withMessage('Valid Vendor ID required'),
  ],
  getProductSalesReport
);

module.exports = router;
