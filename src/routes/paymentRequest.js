const express = require('express');
const { body, param, query } = require('express-validator');
const {
  sendPaymentRequest,
  getMyPaymentRequests,
  getReceivedPaymentRequests,
  approvePaymentRequest,
  rejectPaymentRequest,
  cancelPaymentRequest,
  getPaymentRequest,
} = require('../controllers/paymentRequest');
const { protectUniversal } = require('../middleware/universalAuth');

const router = express.Router();

/**
 * Send payment request
 * POST /api/payment-request/send
 * Can be used by User, Vendor, Rider, or Admin
 */
router.post(
  '/send',
  protectUniversal,
  [
    body('requestedTo')
      .notEmpty()
      .withMessage('Requested to ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid requested to ID'),
    body('requestedToType')
      .notEmpty()
      .withMessage('Requested to type is required')
      .bail()
      .isIn(['User', 'Vendor', 'Rider', 'Admin', 'System'])
      .withMessage('Requested to type must be User, Vendor, Rider, Admin, or System'),
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .bail()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),
    body('currency')
      .optional()
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter code (e.g., INR)'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
    body('paymentMethod')
      .optional()
      .isIn(['wallet', 'bank_transfer', 'upi', 'cash', 'other'])
      .withMessage('Payment method must be wallet, bank_transfer, upi, cash, or other'),
    body('orderId')
      .optional()
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
  ],
  sendPaymentRequest
);

/**
 * Get my payment requests (sent by me)
 * GET /api/payment-request/my-requests
 */
router.get(
  '/my-requests',
  protectUniversal,
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
      .isIn(['pending', 'approved', 'rejected', 'cancelled'])
      .withMessage('Status must be pending, approved, rejected, or cancelled'),
  ],
  getMyPaymentRequests
);

/**
 * Get received payment requests (received by me)
 * GET /api/payment-request/received
 */
router.get(
  '/received',
  protectUniversal,
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
      .isIn(['pending', 'approved', 'rejected', 'cancelled'])
      .withMessage('Status must be pending, approved, rejected, or cancelled'),
  ],
  getReceivedPaymentRequests
);

/**
 * Get single payment request
 * GET /api/payment-request/:requestId
 */
router.get(
  '/:requestId',
  protectUniversal,
  [
    param('requestId')
      .notEmpty()
      .withMessage('Request ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid request ID'),
  ],
  getPaymentRequest
);

/**
 * Approve payment request
 * POST /api/payment-request/:requestId/approve
 */
router.post(
  '/:requestId/approve',
  protectUniversal,
  [
    param('requestId')
      .notEmpty()
      .withMessage('Request ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid request ID'),
  ],
  approvePaymentRequest
);

/**
 * Reject payment request
 * POST /api/payment-request/:requestId/reject
 */
router.post(
  '/:requestId/reject',
  protectUniversal,
  [
    param('requestId')
      .notEmpty()
      .withMessage('Request ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid request ID'),
    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot be more than 500 characters'),
  ],
  rejectPaymentRequest
);

/**
 * Cancel payment request (by requester)
 * POST /api/payment-request/:requestId/cancel
 */
router.post(
  '/:requestId/cancel',
  protectUniversal,
  [
    param('requestId')
      .notEmpty()
      .withMessage('Request ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid request ID'),
  ],
  cancelPaymentRequest
);

module.exports = router;
