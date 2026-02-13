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
  updateInvoice,
  updateInvoiceFromOrder,
  generateOrderInvoicePDF,
  downloadInvoicePDF,
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
 * @route   PUT /api/invoice/order/:orderNumber/update-from-order
 * @desc    Update all invoices for an order with handling charge and total amount from order payment details
 * @access  Private (Admin)
 */
router.put(
  '/order/:orderNumber/update-from-order',
  protect,
  [
    param('orderNumber')
      .notEmpty()
      .withMessage('Order number is required')
      .trim(),
  ],
  updateInvoiceFromOrder
);

/**
 * @route   GET /api/invoice/order/:orderNumber/download-pdf
 * @desc    Download/View invoice PDF for an order
 * @access  Public (can be protected if needed)
 * @query   download=true to force download, otherwise opens in browser
 * 
 * IMPORTANT: This route must be defined BEFORE /order/:orderId to avoid route conflicts
 */
router.get(
  '/order/:orderNumber/download-pdf',
  async (req, res, next) => {
    // Basic validation
    const { orderNumber } = req.params;
    if (!orderNumber || orderNumber.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Order number is required',
      });
    }
    req.params.orderNumber = orderNumber.trim();
    next();
  },
  downloadInvoicePDF
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

/**
 * @route   PUT /api/invoice/:invoiceId
 * @desc    Update invoice data (items, pricing, etc.)
 * @access  Private (Admin)
 */
router.put(
  '/:invoiceId',
  protect,
  [
    param('invoiceId')
      .notEmpty()
      .withMessage('Invoice ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid invoice ID'),
    body('items')
      .optional()
      .isArray()
      .withMessage('Items must be an array'),
    body('items.*.sku')
      .optional()
      .trim(),
    body('items.*.hssn')
      .optional()
      .trim(),
    body('pricing.subtotal')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Subtotal must be a number greater than or equal to 0'),
    body('pricing.discount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Discount must be a number greater than or equal to 0'),
    body('pricing.itemCost')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Item cost must be a number greater than or equal to 0'),
    body('pricing.cgst')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('CGST must be a number greater than or equal to 0'),
    body('pricing.sgst')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('SGST must be a number greater than or equal to 0'),
    body('pricing.totalGst')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Total GST must be a number greater than or equal to 0'),
    body('pricing.handlingCharge')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Handling charge must be a number greater than or equal to 0'),
    body('pricing.totalAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Total amount must be a number greater than or equal to 0'),
    body('pricing.totalCashback')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Total cashback must be a number greater than or equal to 0'),
    body('dueDate')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid date'),
  ],
  updateInvoice
);

/**
 * @route   POST /api/invoice/order/:orderNumber/generate-pdf
 * @desc    Generate invoice PDF for an order and upload to Cloudinary
 * @access  Private (Admin/Vendor/User)
 */
router.post(
  '/order/:orderNumber/generate-pdf',
  [
    param('orderNumber')
      .notEmpty()
      .withMessage('Order number is required')
      .trim(),
  ],
  generateOrderInvoicePDF
);

/**
 * @route   GET /api/invoice/order-statuses
 * @desc    Get all possible order statuses
 * @access  Public
 */
router.get('/order-statuses', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      statuses: [
        {
          value: 'pending',
          label: 'Pending',
          description: 'Order is pending',
        },
        {
          value: 'order_placed',
          label: 'Order Placed',
          description: 'Order has been placed',
        },
        {
          value: 'confirmed',
          label: 'Confirmed',
          description: 'Order has been confirmed',
        },
        {
          value: 'processing',
          label: 'Processing',
          description: 'Order is being processed',
        },
        {
          value: 'ready',
          label: 'Ready',
          description: 'Order is ready for pickup/delivery',
        },
        {
          value: 'rider_assign',
          label: 'Rider Assigned',
          description: 'Rider has been assigned to the order',
        },
        {
          value: 'out_for_delivery',
          label: 'Out for Delivery',
          description: 'Order is out for delivery',
        },
        {
          value: 'delivered',
          label: 'Delivered',
          description: 'Order has been delivered',
        },
        {
          value: 'cancelled',
          label: 'Cancelled',
          description: 'Order has been cancelled',
        },
        {
          value: 'refunded',
          label: 'Refunded',
          description: 'Order has been refunded',
        },
      ],
    },
  });
});

module.exports = router;
