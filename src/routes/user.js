const express = require('express');
const { body, query } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/userOTP');
const { userLogin, userVerifyOTP, userLogout } = require('../controllers/userAuth');
const { getProfile, updateProfile, getCashback } = require('../controllers/user');
const { getAllProducts } = require('../controllers/userProduct');
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
  ],
  updateProfile
);

// Cashback route (protected)
router.get('/cashback', protect, getCashback);

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

module.exports = router;

