const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getAllPaymentGateways,
  getPaymentGateway,
  createPaymentGateway,
  updatePaymentGateway,
  togglePaymentGateway,
  deletePaymentGateway,
  getEnabledPaymentGateways,
  testPaymentGatewayCredentials,
} = require('../controllers/paymentGateway');
const { protect } = require('../middleware/adminAuth');

const router = express.Router();

// Public route - Get enabled payment gateways
router.get('/enabled', getEnabledPaymentGateways);

// Admin routes - All require authentication
router.get(
  '/',
  protect,
  [
    query('enabled')
      .optional()
      .isBoolean()
      .withMessage('Enabled must be a boolean'),
  ],
  getAllPaymentGateways
);

router.get(
  '/:gatewayId',
  protect,
  [
    param('gatewayId')
      .notEmpty()
      .withMessage('Gateway ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid gateway ID'),
  ],
  getPaymentGateway
);

router.post(
  '/',
  protect,
  [
    body('name')
      .notEmpty()
      .withMessage('Payment gateway name is required')
      .bail()
      .isIn(['shopify', 'razorpay', 'phonepay', 'cashfree'])
      .withMessage('Payment gateway name must be one of: shopify, razorpay, phonepay, cashfree'),
    body('displayName')
      .notEmpty()
      .withMessage('Display name is required')
      .bail()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Display name must be between 2 and 100 characters'),
    body('isEnabled')
      .optional()
      .isBoolean()
      .withMessage('isEnabled must be a boolean'),
    body('testMode')
      .optional()
      .isBoolean()
      .withMessage('testMode must be a boolean'),
    body('priority')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Priority must be a non-negative integer'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
    body('credentials')
      .optional()
      .isObject()
      .withMessage('Credentials must be an object'),
    body('testCredentials')
      .optional()
      .isObject()
      .withMessage('Test credentials must be an object'),
  ],
  createPaymentGateway
);

router.put(
  '/:gatewayId',
  protect,
  [
    param('gatewayId')
      .notEmpty()
      .withMessage('Gateway ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid gateway ID'),
    body('displayName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Display name must be between 2 and 100 characters'),
    body('isEnabled')
      .optional()
      .isBoolean()
      .withMessage('isEnabled must be a boolean'),
    body('testMode')
      .optional()
      .isBoolean()
      .withMessage('testMode must be a boolean'),
    body('priority')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Priority must be a non-negative integer'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
    body('credentials')
      .optional()
      .isObject()
      .withMessage('Credentials must be an object'),
    body('testCredentials')
      .optional()
      .isObject()
      .withMessage('Test credentials must be an object'),
  ],
  updatePaymentGateway
);

router.patch(
  '/:gatewayId/toggle',
  protect,
  [
    param('gatewayId')
      .notEmpty()
      .withMessage('Gateway ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid gateway ID'),
  ],
  togglePaymentGateway
);

router.delete(
  '/:gatewayId',
  protect,
  [
    param('gatewayId')
      .notEmpty()
      .withMessage('Gateway ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid gateway ID'),
  ],
  deletePaymentGateway
);

router.post(
  '/test-credentials',
  protect,
  [
    body('gatewayName')
      .notEmpty()
      .withMessage('Gateway name is required')
      .bail()
      .isIn(['shopify', 'razorpay', 'phonepay', 'cashfree'])
      .withMessage('Gateway name must be one of: shopify, razorpay, phonepay, cashfree'),
    body('credentials')
      .notEmpty()
      .withMessage('Credentials are required')
      .bail()
      .isObject()
      .withMessage('Credentials must be an object'),
    body('isTestMode')
      .optional()
      .isBoolean()
      .withMessage('isTestMode must be a boolean'),
  ],
  testPaymentGatewayCredentials
);

module.exports = router;
