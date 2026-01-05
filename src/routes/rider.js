const express = require('express');
const { body, query } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/riderOTP');
const { riderLogin, riderVerifyOTP } = require('../controllers/riderAuth');
const { getProfile, updateProfile, getRiders, getRider, approveRider, suspendRider } = require('../controllers/rider');
const { protect } = require('../middleware/riderAuth');
const { protect: protectAdmin } = require('../middleware/adminAuth');
const { uploadRiderFiles } = require('../middleware/riderUpload');

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
      .trim()
      .notEmpty()
      .withMessage('Full name cannot be empty'),
    body('fathersName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Father\'s name cannot be empty'),
    body('mothersName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Mother\'s name cannot be empty'),
    body('dateOfBirth')
      .optional()
      .isISO8601()
      .withMessage('Please provide a valid date'),
    body('whatsappNumber')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit WhatsApp number'),
    body('bloodGroup')
      .optional()
      .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
      .withMessage('Invalid blood group'),
    body('city')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('City cannot be empty'),
    body('currentAddressLine1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Current address line 1 cannot be empty'),
    body('currentAddressLine2')
      .optional()
      .trim(),
    body('pinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('latitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('longitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
    body('language')
      .optional()
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
      .trim()
      .notEmpty()
      .withMessage('Emergency contact person name cannot be empty'),
    body('emergencyContactPersonRelation')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Emergency contact person relation cannot be empty'),
    body('emergencyContactPersonNumber')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('emergencyContactNumber')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('workDetails')
      .optional()
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
      .trim()
      .notEmpty()
      .withMessage('Aadhar ID cannot be empty'),
    body('accountNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Account number cannot be empty'),
    body('ifsc')
      .optional()
      .trim()
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Please provide a valid IFSC code'),
    body('bankName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Bank name cannot be empty'),
    body('branchName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Branch name cannot be empty'),
    body('accountHolderName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Account holder name cannot be empty'),
  ],
  updateProfile
);

// Admin routes
router.get('/', protectAdmin, getRiders);

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

module.exports = router;

