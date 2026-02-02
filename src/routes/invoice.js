const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();

// Controllers
const {
  getInvoiceById,
  getInvoicesByOrder,
  getUserInvoices,
  getVendorInvoices,
  getAllInvoices,
  updateInvoiceStatus,
} = require('../controllers/invoice');

// Middleware
const { protect: protectUser } = require('../middleware/userAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');
const { protect } = require('../middleware/adminAuth');

/**
 * @route   GET /api/invoice/:invoiceId
 * @desc    Get invoice by ID
 * @access  Public (can be protected if needed)
 */
router.get(
  '/:invoiceId',
  [
    param('invoiceId')
      .notEmpty()
      .withMessage('Invoice ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid invoice ID'),
  ],
  getInvoiceById
);

/**
 * @route   GET /api/invoice/order/:orderId
 * @desc    Get all invoices for an order
 * @access  Public (can be protected if needed)
 */
router.get(
  '/order/:orderId',
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
  ],
  getInvoicesByOrder
);

/**
 * @route   GET /api/invoice/user/my-invoices
 * @desc    Get invoices for authenticated user
 * @access  Private (User)
 */
router.get(
  '/user/my-invoices',
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
    query('status')
      .optional()
      .isIn(['pending', 'paid', 'cancelled', 'refunded'])
      .withMessage('Invalid status'),
  ],
  getUserInvoices
);

/**
 * @route   GET /api/invoice/vendor/my-invoices
 * @desc    Get invoices for authenticated vendor
 * @access  Private (Vendor)
 */
router.get(
  '/vendor/my-invoices',
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
    query('status')
      .optional()
      .isIn(['pending', 'paid', 'cancelled', 'refunded'])
      .withMessage('Invalid status'),
  ],
  getVendorInvoices
);

/**
 * @route   GET /api/invoice/admin/all
 * @desc    Get all invoices (admin only)
 * @access  Private (Admin)
 */
router.get(
  '/admin/all',
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
      .isIn(['pending', 'paid', 'cancelled', 'refunded'])
      .withMessage('Invalid status'),
    query('vendorId')
      .optional()
      .isMongoId()
      .withMessage('Invalid vendor ID'),
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('Invalid user ID'),
  ],
  getAllInvoices
);

/**
 * @route   PATCH /api/invoice/:invoiceId/status
 * @desc    Update invoice status
 * @access  Private (Admin/Vendor)
 */
router.patch(
  '/:invoiceId/status',
  protect,
  [
    param('invoiceId')
      .notEmpty()
      .withMessage('Invoice ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid invoice ID'),
    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .bail()
      .isIn(['pending', 'paid', 'cancelled', 'refunded'])
      .withMessage('Invalid status. Must be one of: pending, paid, cancelled, refunded'),
  ],
  updateInvoiceStatus
);

module.exports = router;
