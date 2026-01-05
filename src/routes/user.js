const express = require('express');
const { body, query } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/userOTP');
const { userLogin, userVerifyOTP } = require('../controllers/userAuth');
const { getProfile, updateProfile } = require('../controllers/user');
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

router.post(
  '/send-otp',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
  ],
  sendOTP
);

router.post(
  '/verify-otp',
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
  verifyOTP
);

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

// Products routes (protected)
router.get(
  '/products',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
  ],
  getAllProducts
);

module.exports = router;

