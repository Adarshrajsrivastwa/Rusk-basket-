const express = require('express');
const { query } = require('express-validator');
const router = express.Router();

// Controllers
const { getAllProductsList } = require('../controllers/productGet');
const { getAllOrders } = require('../controllers/checkout');

// Middleware
const { protect } = require('../middleware/adminAuth');

// Get all products list - simplified view (Admin only)
router.get(
  '/products',
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

// Get all orders (Admin only)
router.get(
  '/orders',
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
    query('status')
      .optional()
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid order status'),
    query('user')
      .optional()
      .isMongoId()
      .withMessage('User must be a valid MongoDB ObjectId'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('paymentStatus')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'refunded'])
      .withMessage('Invalid payment status'),
    query('paymentMethod')
      .optional()
      .isIn(['cod', 'prepaid', 'wallet', 'upi', 'card'])
      .withMessage('Invalid payment method'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
  ],
  getAllOrders
);

module.exports = router;
