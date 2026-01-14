const express = require('express');
const { query } = require('express-validator');
const {
  getVendorDashboard,
  getVendorSales,
  getVendorProductPerformance,
  getAdminDashboard,
  getAdminSales,
  getAdminVendorAnalytics,
  getAdminProductAnalytics,
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

module.exports = router;
