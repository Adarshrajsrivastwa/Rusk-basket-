const express = require('express');
const { body, query, param } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/riderOTP');
const { riderLogin, riderVerifyOTP, riderLogout } = require('../controllers/riderAuth');
const { getProfile, updateProfile, getRiders, getRider, approveRider, suspendRider, getPendingRiders, getAvailableOrders, acceptOrderAssignment, rejectOrderAssignment, getMyOrders, getDeliveredOrders, getCurrentOrder, markOrderDelivered, uploadDeliveryImage, uploadDeliveredImage, markOrderPaymentAsCash, sendEarningWalletAmount, getMyWithdrawalRequests } = require('../controllers/rider');
const { isRiderConnected, getConnectedRidersCount } = require('../utils/socket');
const { protect } = require('../middleware/riderAuth');
const { protect: protectAdmin } = require('../middleware/adminAuth');
const { uploadRiderFiles, uploadDeliveryImage: uploadDeliveryImageMiddleware } = require('../middleware/riderUpload');
const { createRiderTicket, getRiderTickets, getRiderTicket, addRiderTicketMessage } = require('../controllers/ticket');

const router = express.Router();

// Public routes - Authentication
router.post(
  '/login',
  [
    body('mobileNumber')
      .trim()
      .notEmpty()
      .withMessage('Mobile number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit mobile number'),
  ],
  riderLogin
);

router.post(
  '/verify-login-otp',
  [
    body('mobileNumber')
      .trim()
      .notEmpty()
      .withMessage('Mobile number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit mobile number'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .bail()
      .matches(/^[0-9]{4}$/)
      .withMessage('OTP must be a 4-digit number'),
  ],
  riderVerifyOTP
);

// router.post(
//   '/send-otp',
//   [
//     body('mobileNumber')
//       .trim()
//       .notEmpty()
//       .withMessage('Mobile number is required')
//       .bail()
//       .matches(/^[0-9]{10}$/)
//       .withMessage('Please provide a valid 10-digit mobile number'),
//   ],
//   sendOTP
// );

// router.post(
//   '/verify-otp',
//   [
//     body('mobileNumber')
//       .trim()
//       .notEmpty()
//       .withMessage('Mobile number is required')
//       .bail()
//       .matches(/^[0-9]{10}$/)
//       .withMessage('Please provide a valid 10-digit mobile number'),
//     body('otp')
//       .trim()
//       .notEmpty()
//       .withMessage('OTP is required')
//       .bail()
//       .matches(/^[0-9]{4}$/)
//       .withMessage('OTP must be a 4-digit number'),
//   ],
//   verifyOTP
// );

// Protected routes - Rider profile
router.get('/profile', protect, getProfile);

router.put(
  '/profile',
  protect,
  uploadRiderFiles,
  [
    body('fullName')
      .optional()
      .trim(),
    body('fathersName')
      .optional()
      .trim(),
    body('mothersName')
      .optional()
      .trim(),
    body('dateOfBirth')
      .optional({ checkFalsy: true })
      .isISO8601()
      .withMessage('Please provide a valid date'),
    body('whatsappNumber')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit WhatsApp number'),
    body('bloodGroup')
      .optional({ checkFalsy: true })
      .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
      .withMessage('Invalid blood group'),
    body('city')
      .optional()
      .trim(),
    body('currentAddressLine1')
      .optional()
      .trim(),
    body('currentAddressLine2')
      .optional()
      .trim(),
    body('pinCode')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('latitude')
      .optional({ checkFalsy: true })
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('longitude')
      .optional({ checkFalsy: true })
      .isFloat()
      .withMessage('Longitude must be a valid number'),
    body('language')
      .optional({ checkFalsy: true })
      .custom((value) => {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      })
      .withMessage('Language must be a valid JSON array'),
    body('emergencyContactPersonName')
      .optional()
      .trim(),
    body('emergencyContactPersonRelation')
      .optional()
      .trim(),
    body('emergencyContactPersonNumber')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('emergencyContactNumber')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('workDetails')
      .optional({ checkFalsy: true })
      .custom((value) => {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          return typeof parsed === 'object';
        } catch {
          return false;
        }
      })
      .withMessage('Work details must be a valid JSON object'),
    body('aadharId')
      .optional()
      .trim(),
    body('accountNumber')
      .optional()
      .trim(),
    body('ifsc')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Please provide a valid IFSC code'),
    body('bankName')
      .optional()
      .trim(),
    body('branchName')
      .optional()
      .trim(),
    body('accountHolderName')
      .optional()
      .trim(),
  ],
  updateProfile
);

// Get delivered orders by specific rider ID (must be before /:id route)
router.get(
  '/:riderId/orders/delivered',
  [
    param('riderId')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getDeliveredOrders
);

// Get current/active order for specific rider ID (must be before /:id route)
router.get(
  '/:riderId/orders/current',
  [
    param('riderId')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
  ],
  getCurrentOrder
);

// Admin routes
router.get('/', protectAdmin, getRiders);
router.get('/pending', protectAdmin, getPendingRiders);

router.get('/:id', protectAdmin, getRider);

router.put('/:id/approve', protectAdmin, approveRider);

router.put('/:id/reject', protectAdmin, [
  body('rejectionReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Rejection reason cannot be more than 500 characters'),
], approveRider);

router.put('/:id/suspend', protectAdmin, suspendRider);

// Rider order management routes
router.get(
  '/orders/available',
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
  getAvailableOrders
);

router.post(
  '/orders/:orderId/accept',
  protect,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  acceptOrderAssignment
);

router.post(
  '/orders/:orderId/reject',
  protect,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot be more than 500 characters'),
  ],
  rejectOrderAssignment
);

// Upload delivery image and update order status to out_for_delivery
router.post(
  '/orders/:orderId/upload-delivery-image',
  protect,
  uploadDeliveryImageMiddleware,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  uploadDeliveryImage
);

// Upload delivered image and mark order as delivered (out_for_delivery -> delivered)
router.post(
  '/orders/:orderId/delivered-image',
  protect,
  uploadDeliveryImageMiddleware,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  uploadDeliveredImage
);

// Mark order as delivered (with optional image upload)
router.post(
  '/orders/:orderId/delivered',
  protect,
  uploadDeliveryImageMiddleware,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  markOrderDelivered
);

router.get(
  '/orders/my-orders',
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
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'rider_assign', 'out_for_delivery', 'delivered', 'cancelled'])
      .withMessage('Invalid status'),
  ],
  getMyOrders
);

// Get delivered orders by rider ID (protected - uses authenticated rider)
router.get(
  '/orders/delivered',
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
  getDeliveredOrders
);

// Get current/active order for rider (protected - uses authenticated rider)
router.get(
  '/orders/current',
  protect,
  getCurrentOrder
);

// WebSocket connection status
router.get('/websocket/status', protect, (req, res) => {
  try {
    const riderId = req.rider._id;
    const connected = isRiderConnected(riderId);
    const totalConnected = getConnectedRidersCount();

    res.status(200).json({
      success: true,
      data: {
        connected,
        totalConnectedRiders: totalConnected,
        message: connected 
          ? 'You are connected to the real-time order assignment service' 
          : 'You are not connected. Please connect to receive real-time order assignments.',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check WebSocket status',
    });
  }
});

// Logout route (protected)
router.post('/logout', protect, riderLogout);

// Ticket routes (protected - rider can create and manage their tickets)
router.post(
  '/tickets',
  protect,
  [
    body('complaint')
      .trim()
      .notEmpty()
      .withMessage('Complaint is required')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Complaint must be between 10 and 2000 characters'),
    body('category')
      .optional()
      .isIn(['order_delivery', 'account_profile', 'payments_refunds', 'login_otp', 'general_queries'])
      .withMessage('Invalid category. Must be one of: order_delivery, account_profile, payments_refunds, login_otp, general_queries'),
    body('orderId')
      .optional()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  createRiderTicket
);

router.get(
  '/tickets',
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
      .isIn(['active', 'pending', 'resolved', 'closed'])
      .withMessage('Invalid status. Must be one of: active, pending, resolved, closed'),
    query('category')
      .optional()
      .isIn(['order_delivery', 'account_profile', 'payments_refunds', 'login_otp', 'general_queries'])
      .withMessage('Invalid category. Must be one of: order_delivery, account_profile, payments_refunds, login_otp, general_queries'),
  ],
  getRiderTickets
);

router.get(
  '/tickets/:ticketId',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
  ],
  getRiderTicket
);

router.post(
  '/tickets/:ticketId/messages',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
  ],
  addRiderTicketMessage
);

// Mark order payment as cash and add to rider due wallet
router.post(
  '/order/:orderId/mark-payment-cash',
  protect,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID format'),
  ],
  markOrderPaymentAsCash
);

// Send/Transfer amount from rider's earningWallet (creates withdrawal request)
router.post(
  '/wallet/earning/send',
  protect,
  [
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .bail()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number greater than 0'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
  ],
  sendEarningWalletAmount
);

// Get rider's own withdrawal requests
router.get(
  '/wallet/earning/withdrawal-requests',
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
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Status must be pending, approved, or rejected'),
  ],
  getMyWithdrawalRequests
);

module.exports = router;

