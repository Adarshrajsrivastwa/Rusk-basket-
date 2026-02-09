const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getWallet,
  resetWallet,
  getWalletTransactions,
} = require('../controllers/wallet');
const { protect } = require('../middleware/userAuth');
const { protectVendorOrAdmin } = require('../middleware/vendorOrAdminAuth');

const router = express.Router();

/**
 * Get user wallet (User only)
 */
router.get('/', protect, getWallet);

/**
 * Get wallet transactions (User only)
 */
router.get(
  '/transactions',
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
  ],
  getWalletTransactions
);

/**
 * Reset wallet balance (Vendor/Admin only)
 */
router.post(
  '/reset/:userId',
  protectVendorOrAdmin,
  [
    param('userId')
      .notEmpty()
      .withMessage('User ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid user ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason cannot be more than 500 characters'),
  ],
  resetWallet
);

module.exports = router;
