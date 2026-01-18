const express = require('express');
const { body, query } = require('express-validator');
const {
  createCoupon,
  getCoupons,
  getCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getAvailableCoupons,
} = require('../controllers/coupon');
const { getActiveTodayOffers } = require('../controllers/couponNotification');
const { protect } = require('../middleware/adminAuth');
const { protect: protectUser } = require('../middleware/userAuth');

const router = express.Router();

// Public route for users to get active today's offers (must be before admin routes)
router.get('/today-offers', getActiveTodayOffers);

// User route to get available coupons (must be before admin routes)
router.get(
  '/available',
  protectUser,
  [
    query('cartAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cart amount must be a non-negative number'),
  ],
  getAvailableCoupons
);

// All routes below require admin authentication
router.post(
  '/create',
  protect,
  [
    body('couponName')
      .trim()
      .notEmpty()
      .withMessage('Coupon name is required')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Coupon name cannot be more than 200 characters'),
    body('offerId')
      .trim()
      .notEmpty()
      .withMessage('Offer ID is required')
      .bail()
      .isLength({ min: 3, max: 50 })
      .withMessage('Offer ID must be between 3 and 50 characters'),
    body('offerType')
      .trim()
      .notEmpty()
      .withMessage('Offer type is required')
      .bail()
      .isIn(['percentage', 'fixed', 'free_shipping', 'buy_one_get_one', 'prepaid', 'today_offer'])
      .withMessage('Offer type must be percentage, fixed, free_shipping, buy_one_get_one, prepaid, or today_offer'),
    body('code')
      .trim()
      .notEmpty()
      .withMessage('Coupon code is required')
      .bail()
      .isLength({ min: 3, max: 20 })
      .withMessage('Coupon code must be between 3 and 20 characters')
      .bail()
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Coupon code must contain only uppercase letters and numbers'),
    body('minAmount')
      .notEmpty()
      .withMessage('Minimum amount is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Minimum amount must be a number greater than or equal to 0'),
    body('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum amount must be a number greater than or equal to 0'),
    body('discountAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Discount amount must be a number greater than or equal to 0'),
    body('discountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount percentage must be between 0 and 100'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'expired'])
      .withMessage('Status must be active, inactive, or expired'),
    body('validFrom')
      .optional()
      .isISO8601()
      .withMessage('Valid from must be a valid date'),
    body('validUntil')
      .optional()
      .isISO8601()
      .withMessage('Valid until must be a valid date'),
    body('usageLimit')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Usage limit must be a non-negative integer'),
    body().custom((value, { req }) => {
      const { offerType, discountAmount, discountPercentage, prepaidDiscountPercentage, products, offerAmount, dateRange, timeRange, appliedOn, categories } = req.body;
      
      if (offerType === 'percentage' && !discountPercentage) {
        throw new Error('Discount percentage is required for percentage type offers');
      }
      if (offerType === 'fixed' && !discountAmount) {
        throw new Error('Discount amount is required for fixed type offers');
      }
      if (offerType === 'prepaid' && !prepaidDiscountPercentage) {
        throw new Error('Prepaid discount percentage is required for prepaid offers');
      }
      if (offerType === 'today_offer') {
        if (!products || products.length === 0) {
          throw new Error('At least one product is required for today\'s offer');
        }
        if (!offerAmount) {
          throw new Error('Offer amount is required for today\'s offer');
        }
        if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
          throw new Error('Date range is required for today\'s offer');
        }
        if (!timeRange || !timeRange.startTime || !timeRange.endTime) {
          throw new Error('Time range is required for today\'s offer');
        }
      }
      if (appliedOn === 'select' && (!categories || categories.length === 0)) {
        throw new Error('At least one category is required when appliedOn is select');
      }
      return true;
    }),
  ],
  createCoupon
);

router.get(
  '/',
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
      .isIn(['active', 'inactive', 'expired'])
      .withMessage('Status must be active, inactive, or expired'),
    query('offerType')
      .optional()
      .isIn(['percentage', 'fixed', 'free_shipping', 'buy_one_get_one', 'prepaid', 'today_offer'])
      .withMessage('Offer type must be percentage, fixed, free_shipping, buy_one_get_one, prepaid, or today_offer'),
  ],
  getCoupons
);

router.get('/:id', protect, getCoupon);

router.put(
  '/:id',
  protect,
  [
    body('couponName')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Coupon name cannot be more than 200 characters'),
    body('offerId')
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Offer ID must be between 3 and 50 characters'),
    body('offerType')
      .optional()
      .isIn(['percentage', 'fixed', 'free_shipping', 'buy_one_get_one', 'prepaid', 'today_offer'])
      .withMessage('Offer type must be percentage, fixed, free_shipping, buy_one_get_one, prepaid, or today_offer'),
    body('code')
      .optional()
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage('Coupon code must be between 3 and 20 characters')
      .bail()
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Coupon code must contain only uppercase letters and numbers'),
    body('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum amount must be a number greater than or equal to 0'),
    body('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum amount must be a number greater than or equal to 0'),
    body('discountAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Discount amount must be a number greater than or equal to 0'),
    body('discountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount percentage must be between 0 and 100'),
    body('appliedOn')
      .optional()
      .isIn(['all', 'select'])
      .withMessage('Applied on must be all or select'),
    body('categories')
      .optional()
      .isArray()
      .withMessage('Categories must be an array'),
    body('categories.*')
      .optional()
      .isMongoId()
      .withMessage('Each category must be a valid MongoDB ObjectId'),
    body('prepaidMinAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Prepaid minimum amount must be a number greater than or equal to 0'),
    body('prepaidMaxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Prepaid maximum amount must be a number greater than or equal to 0'),
    body('prepaidDiscountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Prepaid discount percentage must be between 0 and 100'),
    body('products')
      .optional()
      .isArray()
      .withMessage('Products must be an array'),
    body('products.*')
      .optional()
      .isMongoId()
      .withMessage('Each product must be a valid MongoDB ObjectId'),
    body('offerAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Offer amount must be a number greater than or equal to 0'),
    body('dateRange.startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('dateRange.endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('timeRange.startTime')
      .optional()
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Start time must be in HH:MM format (24-hour)'),
    body('timeRange.endTime')
      .optional()
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('End time must be in HH:MM format (24-hour)'),
    body('sendNotification')
      .optional()
      .isBoolean()
      .withMessage('Send notification must be a boolean'),
    body('status')
      .optional()
      .isIn(['active', 'inactive', 'expired'])
      .withMessage('Status must be active, inactive, or expired'),
    body('validFrom')
      .optional()
      .isISO8601()
      .withMessage('Valid from must be a valid date'),
    body('validUntil')
      .optional()
      .isISO8601()
      .withMessage('Valid until must be a valid date'),
    body('usageLimit')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Usage limit must be a non-negative integer'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  updateCoupon
);

router.delete('/:id', protect, deleteCoupon);

router.put('/:id/toggle-status', protect, toggleCouponStatus);

module.exports = router;

