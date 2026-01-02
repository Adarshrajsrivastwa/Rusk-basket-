const express = require('express');
const { body } = require('express-validator');
const { login, verifyOTP } = require('../controllers/superadmin');

const router = express.Router();

router.post(
  '/login',
  [
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile number is required')
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit mobile number'),
  ],
  login
);

router.post(
  '/verify-otp',
  [
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile number is required')
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit mobile number'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .matches(/^[0-9]{4}$/)
      .withMessage('OTP must be a 4-digit number'),
  ],
  verifyOTP
);

module.exports = router;

