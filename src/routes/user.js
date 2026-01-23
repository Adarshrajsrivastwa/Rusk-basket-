const express = require('express');
const { body, query, param } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/userOTP');
const { userLogin, userVerifyOTP, userLogout } = require('../controllers/userAuth');
const { getProfile, updateProfile, getCashback, addAddress, getAddresses, updateAddress, deleteAddress, setDefaultAddress } = require('../controllers/user');
const { getAllProducts } = require('../controllers/userProduct');
const { createTicket, getTickets, getTicket, updateTicket, addTicketMessage } = require('../controllers/ticket');
const { protect } = require('../middleware/userAuth');
const { uploadProfileImage } = require('../middleware/userUpload');

const router = express.Router();

router.post(
  '/login',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
  ],
  userLogin
);

router.post(
  '/verify-login-otp',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .bail()
      .matches(/^[0-9]{4}$/)
      .withMessage('OTP must be a 4-digit number'),
  ],
  userVerifyOTP
);

// router.post(
//   '/send-otp',
//   [
//     body('contactNumber')
//       .trim()
//       .notEmpty()
//       .withMessage('Contact number is required')
//       .bail()
//       .matches(/^[0-9]{10}$/)
//       .withMessage('Please provide a valid 10-digit contact number'),
//   ],
//   sendOTP
// );

// router.post(
//   '/verify-otp',
//   [
//     body('contactNumber')
//       .trim()
//       .notEmpty()
//       .withMessage('Contact number is required')
//       .bail()
//       .matches(/^[0-9]{10}$/)
//       .withMessage('Please provide a valid 10-digit contact number'),
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

// Profile routes (protected)
router.get('/profile', protect, getProfile);

router.put(
  '/profile',
  protect,
  uploadProfileImage,
  [
    body('userName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('User name cannot be empty'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other'])
      .withMessage('Gender must be male, female, or other'),
    body('dateOfBirth')
      .optional()
      .isISO8601()
      .withMessage('Please provide a valid date'),
    // Legacy address fields (for backward compatibility)
    body('addressLine1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Address line 1 cannot be empty'),
    body('addressLine2')
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
    // Default address fields
    body('defaultAddressLine1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Default address line 1 cannot be empty'),
    body('defaultAddressLine2')
      .optional()
      .trim(),
    body('defaultAddressPinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('defaultAddressLabel')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Default address label cannot exceed 50 characters'),
    body('defaultAddressLatitude')
      .optional()
      .isFloat()
      .withMessage('Default address latitude must be a valid number'),
    body('defaultAddressLongitude')
      .optional()
      .isFloat()
      .withMessage('Default address longitude must be a valid number'),
  ],
  updateProfile
);

// Cashback route (protected)
router.get('/cashback', protect, getCashback);

// Address routes (protected)
router.post(
  '/addresses',
  protect,
  [
    body('line1')
      .trim()
      .notEmpty()
      .withMessage('Address line 1 is required'),
    body('line2')
      .optional()
      .trim(),
    body('pinCode')
      .trim()
      .notEmpty()
      .withMessage('PIN code is required')
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('label')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Label cannot exceed 50 characters'),
    body('latitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('longitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
    body('isDefault')
      .optional()
      .isBoolean()
      .withMessage('isDefault must be a boolean'),
  ],
  addAddress
);

router.get('/addresses', protect, getAddresses);

router.put(
  '/addresses/:addressId',
  protect,
  [
    param('addressId')
      .notEmpty()
      .withMessage('Address ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid address ID'),
    body('line1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Address line 1 cannot be empty'),
    body('line2')
      .optional()
      .trim(),
    body('pinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('label')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Label cannot exceed 50 characters'),
    body('latitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('longitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
    body('isDefault')
      .optional()
      .isBoolean()
      .withMessage('isDefault must be a boolean'),
  ],
  updateAddress
);

router.delete(
  '/addresses/:addressId',
  protect,
  [
    param('addressId')
      .notEmpty()
      .withMessage('Address ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid address ID'),
  ],
  deleteAddress
);

router.patch(
  '/addresses/:addressId/set-default',
  protect,
  [
    param('addressId')
      .notEmpty()
      .withMessage('Address ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid address ID'),
  ],
  setDefaultAddress
);

// Logout route (protected)
router.post('/logout', protect, userLogout);

// Products routes (protected)
router.get(
  '/products',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
    query('latitude')
      .notEmpty()
      .withMessage('Latitude is required')
      .bail()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be a number between -90 and 90'),
    query('longitude')
      .notEmpty()
      .withMessage('Longitude is required')
      .bail()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be a number between -180 and 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 1000 })
      .withMessage('Radius must be a number between 0.1 and 1000 km'),
    query('tag')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Tag must be between 1 and 50 characters'),
  ],
  getAllProducts
);

// Ticket routes (protected)
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
  createTicket
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
  getTickets
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
  getTicket
);

router.patch(
  '/tickets/:ticketId',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
    body('complaint')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Complaint cannot be empty')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Complaint must be between 10 and 2000 characters'),
    body('category')
      .optional()
      .isIn(['order_delivery', 'account_profile', 'payments_refunds', 'login_otp', 'general_queries'])
      .withMessage('Invalid category. Must be one of: order_delivery, account_profile, payments_refunds, login_otp, general_queries'),
    body('orderId')
      .optional()
      .custom((value) => {
        if (value === null || value === '') {
          return true; // Allow null or empty string
        }
        return /^[0-9a-fA-F]{24}$/.test(value); // MongoDB ObjectId format
      })
      .withMessage('Invalid order ID format'),
    body().custom((value) => {
      const hasFields = value.complaint !== undefined || 
                       value.category !== undefined || 
                       value.orderId !== undefined;
      if (!hasFields) {
        throw new Error('At least one field (complaint, category, or orderId) must be provided');
      }
      return true;
    }),
  ],
  updateTicket
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
  addTicketMessage
);

module.exports = router;

