const express = require('express');
const { body, query, param } = require('express-validator');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
  getVendorOrders,
  getVendorOrder,
  updateOrderStatus,
} = require('../controllers/checkout');
const { protect } = require('../middleware/userAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');

const router = express.Router();

// Vendor order routes - completely separate from user routes
// These routes use vendor authentication, not user authentication
router.get(
  '/vendor/orders',
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
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid order status'),
  ],
  getVendorOrders
);

router.get(
  '/vendor/order/:orderId',
  protectVendor,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
  ],
  getVendorOrder
);

router.put(
  '/vendor/order/:orderId/status',
  protectVendor,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .bail()
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
      .withMessage('Status must be one of: pending, confirmed, processing, ready, out_for_delivery, delivered, cancelled'),
  ],
  updateOrderStatus
);

// All routes below require user authentication
// Vendor routes above are excluded from this middleware
router.use((req, res, next) => {
  // Skip user auth for vendor routes
  if (req.path.startsWith('/vendor/')) {
    return next();
  }
  protect(req, res, next);
});

// Cart routes
router.get('/cart', getCart);

router.post(
  '/cart/add',
  [
    body('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
    body('quantity')
      .notEmpty()
      .withMessage('Quantity is required')
      .bail()
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),
    body('sku')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('SKU cannot be empty'),
  ],
  addToCart
);

// Update cart item - supports both path parameter and query parameter
router.put(
  '/cart/item/:itemId',
  [
    param('itemId')
      .optional()
      .isMongoId()
      .withMessage('Invalid item ID in path'),
    body('quantity')
      .notEmpty()
      .withMessage('Quantity is required')
      .bail()
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
  ],
  updateCartItem
);

// Alternative route with query parameter
router.put(
  '/cart/item',
  [
    query('itemId')
      .notEmpty()
      .withMessage('Item ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid item ID'),
    body('quantity')
      .notEmpty()
      .withMessage('Quantity is required')
      .bail()
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
  ],
  updateCartItem
);

// Remove cart item - supports both path parameter and query parameter
router.delete(
  '/cart/item/:itemId',
  [
    param('itemId')
      .notEmpty()
      .withMessage('Item ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid item ID'),
  ],
  removeFromCart
);

// Alternative route with query parameter
router.delete(
  '/cart/item',
  [
    query('itemId')
      .notEmpty()
      .withMessage('Item ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid item ID'),
  ],
  removeFromCart
);

router.delete('/cart/clear', clearCart);

// Coupon routes
router.post(
  '/cart/coupon/apply',
  [
    body('couponCode')
      .trim()
      .notEmpty()
      .withMessage('Coupon code is required')
      .bail()
      .isLength({ min: 3, max: 20 })
      .withMessage('Coupon code must be between 3 and 20 characters')
      .bail()
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Coupon code must contain only uppercase letters and numbers'),
  ],
  applyCoupon
);

router.delete('/cart/coupon/remove', removeCoupon);

// Order routes
router.post(
  '/order/create',
  [
    body('shippingAddress.line1')
      .trim()
      .notEmpty()
      .withMessage('Address line 1 is required'),
    body('shippingAddress.pinCode')
      .trim()
      .notEmpty()
      .withMessage('PIN code is required')
      .bail()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('shippingAddress.city')
      .trim()
      .notEmpty()
      .withMessage('City is required'),
    body('shippingAddress.state')
      .trim()
      .notEmpty()
      .withMessage('State is required'),
    body('shippingAddress.phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit phone number'),
    body('paymentMethod')
      .notEmpty()
      .withMessage('Payment method is required')
      .bail()
      .isIn(['cod', 'prepaid', 'wallet', 'upi', 'card'])
      .withMessage('Payment method must be cod, prepaid, wallet, upi, or card'),
    body('shippingAddress.line2')
      .optional()
      .trim(),
    body('shippingAddress.latitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('shippingAddress.longitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot be more than 1000 characters'),
  ],
  createOrder
);

router.get(
  '/orders',
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
  ],
  getOrders
);

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
  getOrder
);

router.post(
  '/order/:orderId/cancel',
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Cancellation reason cannot be more than 500 characters'),
  ],
  cancelOrder
);

module.exports = router;

