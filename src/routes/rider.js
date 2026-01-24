const express = require('express');
const { body, query } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/riderOTP');
const { riderLogin, riderVerifyOTP, riderLogout } = require('../controllers/riderAuth');
const { getProfile, updateProfile, getRiders, getRider, approveRider, suspendRider, getPendingRiders, getAvailableOrders, acceptOrderAssignment, rejectOrderAssignment, getMyOrders } = require('../controllers/rider');
const { isRiderConnected, getConnectedRidersCount } = require('../utils/socket');
const { protect } = require('../middleware/riderAuth');
const { protect: protectAdmin } = require('../middleware/adminAuth');
const { uploadRiderFiles } = require('../middleware/riderUpload');

const 


router = express.Router();

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
  acceptOrderAssignment
);

router.post(
  '/orders/:orderId/reject',
  protect,
  [
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot be more than 500 characters'),
  ],
  rejectOrderAssignment
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
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
      .withMessage('Invalid status'),
  ],
  getMyOrders
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

module.exports = router;

