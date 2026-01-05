const express = require('express');
const { body } = require('express-validator');
const { login, verifyOTP } = require('../controllers/unifiedAuth');

const router = express.Router();

router.post(
  '/login',
  [
    body('mobile')
      .trim()
      .notEmpty()
      .withMessage('Mobile number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit mobile number'),
    body('role')
      .trim()
      .notEmpty()
      .withMessage('Role is required')
      .bail()
      .isIn(['admin', 'vendor'])
      .withMessage('Role must be either "admin" or "vendor"'),
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
    body('role')
      .trim()
      .notEmpty()
      .withMessage('Role is required')
      .bail()
      .isIn(['admin', 'vendor'])
      .withMessage('Role must be either "admin" or "vendor"'),
  ],
  verifyOTP
);

module.exports = router;
