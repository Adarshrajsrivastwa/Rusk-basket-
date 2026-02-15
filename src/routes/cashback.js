const express = require('express');
const { body, param, query } = require('express-validator');
const {
  // Admin endpoints
  getCashbackSettings,
  updateCashbackSettings,
  getAllCashbackTransactions,
  adjustUserCashback,
  getUserCashbackStats,
  // User endpoints
  getUserCashback,
  getUserCashbackTransactions,
  getPendingCashback,
  claimPendingCashback,
  claimAllPendingCashback,
  calculateAvailableCashback,
} = require('../controllers/cashback');
const { protect } = require('../middleware/adminAuth');
const { protect: protectUser } = require('../middleware/userAuth');

const router = express.Router();

/**
 * ============================================
 * ADMIN ROUTES
 * ============================================
 */

/**
 * Get cashback settings (Admin only)
 */
router.get('/admin/settings', protect, getCashbackSettings);

/**
 * Update cashback settings (Admin only)
 */
router.put(
  '/admin/settings',
  protect,
  [
    body('cashbackPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Cashback percentage must be between 0 and 100'),
    body('minimumOrderAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum order amount must be greater than or equal to 0'),
    body('maximumCashbackPerOrder')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum cashback per order must be greater than or equal to 0'),
    body('minimumCashbackToUse')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum cashback to use must be greater than or equal to 0'),
    body('maxCashbackUsagePercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Max cashback usage percentage must be between 0 and 100'),
    body('maxCashbackUsageAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max cashback usage amount must be greater than or equal to 0'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  updateCashbackSettings
);

/**
 * Get all cashback transactions (Admin only)
 */
router.get(
  '/admin/transactions',
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
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('User ID must be a valid MongoDB ObjectId'),
  ],
  getAllCashbackTransactions
);

/**
 * Adjust user cashback (Admin only)
 * Creates pending cashback that user needs to claim
 */
router.post(
  '/admin/adjust/:userId',
  protect,
  [
    param('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid user ID'),
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .bail()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
    body('expiresInDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Expires in days must be between 1 and 365'),
  ],
  adjustUserCashback
);

/**
 * Get user cashback statistics (Admin only)
 */
router.get(
  '/admin/user-stats/:userId',
  protect,
  [
    param('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid user ID'),
  ],
  getUserCashbackStats
);

/**
 * ============================================
 * USER ROUTES
 * ============================================
 */

/**
 * Get user cashback balance
 */
router.get('/user/balance', protectUser, getUserCashback);

/**
 * Get user cashback transactions
 */
router.get(
  '/user/transactions',
  protectUser,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('type')
      .optional()
      .isIn(['earned', 'used', 'expired', 'adjusted'])
      .withMessage('Type must be earned, used, expired, or adjusted'),
  ],
  getUserCashbackTransactions
);

/**
 * Get pending cashback
 */
router.get('/user/pending', protectUser, getPendingCashback);

/**
 * Claim pending cashback
 */
router.post(
  '/user/claim',
  protectUser,
  [
    body('pendingCashbackId')
      .notEmpty()
      .withMessage('Pending cashback ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid pending cashback ID'),
  ],
  claimPendingCashback
);

/**
 * Claim all pending cashback
 */
router.post('/user/claim-all', protectUser, claimAllPendingCashback);

/**
 * Calculate available cashback for an order
 */
router.post(
  '/user/calculate',
  protectUser,
  [
    body('orderTotal')
      .notEmpty()
      .withMessage('Order total is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Order total must be a positive number'),
  ],
  calculateAvailableCashback
);

module.exports = router;
