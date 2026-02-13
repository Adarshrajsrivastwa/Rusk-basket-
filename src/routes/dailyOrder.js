const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();

const {
  createOrUpdateDailyOrder,
  getDailyOrder,
  deactivateDailyOrder,
} = require('../controllers/dailyOrder');

const { protect: protectUser } = require('../middleware/userAuth');

/**
 * @route   PUT /api/daily-order
 * @desc    Create or update daily order
 * @access  Private (User)
 */
router.put(
  '/',
  protectUser,
  [
    body('items')
      .isArray({ min: 1 })
      .withMessage('Items must be a non-empty array'),
    body('items.*.productId')
      .notEmpty()
      .withMessage('Product ID is required for each item')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
    body('items.*.quantity')
      .notEmpty()
      .withMessage('Quantity is required for each item')
      .bail()
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    body('items.*.sku')
      .optional()
      .trim(),
    body('shippingAddress.line1')
      .notEmpty()
      .withMessage('Shipping address line1 is required')
      .trim(),
    body('shippingAddress.pinCode')
      .notEmpty()
      .withMessage('PIN code is required')
      .bail()
      .matches(/^[0-9]{6}$/)
      .withMessage('PIN code must be 6 digits'),
    body('shippingAddress.city')
      .notEmpty()
      .withMessage('City is required')
      .trim(),
    body('shippingAddress.state')
      .notEmpty()
      .withMessage('State is required')
      .trim(),
    body('shippingAddress.phone')
      .notEmpty()
      .withMessage('Phone number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Phone number must be 10 digits'),
    body('shippingAddress.line2')
      .optional()
      .trim(),
    body('shippingAddress.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('shippingAddress.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('daysOfWeek')
      .isArray({ min: 1 })
      .withMessage('Days of week must be a non-empty array'),
    body('daysOfWeek.*')
      .isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .withMessage('Invalid day of week. Must be one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday'),
    body('deliveryTime')
      .optional()
      .trim(),
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot be more than 1000 characters'),
  ],
  createOrUpdateDailyOrder
);

/**
 * @route   GET /api/daily-order
 * @desc    Get daily order for authenticated user
 * @access  Private (User)
 */
router.get(
  '/',
  protectUser,
  getDailyOrder
);

/**
 * @route   DELETE /api/daily-order
 * @desc    Deactivate daily order
 * @access  Private (User)
 */
router.delete(
  '/',
  protectUser,
  deactivateDailyOrder
);

module.exports = router;
