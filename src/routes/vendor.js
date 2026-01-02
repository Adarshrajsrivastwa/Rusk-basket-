const express = require('express');
const { body } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/vendorOTP');
const { vendorLogin, vendorVerifyOTP } = require('../controllers/vendorAuth');
const { createVendor, getVendors, getVendor, updateVendorPermissions, updateVendor, suspendVendor, deleteVendor } = require('../controllers/vendor');
const { protect } = require('../middleware/superadminAuth');
const { uploadFields } = require('../middleware/upload');

const router = express.Router();

router.post(
  '/login',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
  ],
  vendorLogin
);

router.post(
  '/verify-login-otp',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .matches(/^[0-9]{4}$/)
      .withMessage('OTP must be a 4-digit number'),
  ],
  vendorVerifyOTP
);

router.post(
  '/send-otp',
  [
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
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
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .matches(/^[0-9]{4}$/)
      .withMessage('OTP must be a 4-digit number'),
  ],
  verifyOTP
);

router.post(
  '/create',
  protect,
  uploadFields,
  [
    body('vendorName')
      .trim()
      .notEmpty()
      .withMessage('Vendor name is required'),
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('gender')
      .isIn(['male', 'female', 'other'])
      .withMessage('Gender must be male, female, or other'),
    body('dateOfBirth')
      .notEmpty()
      .withMessage('Date of birth is required')
      .isISO8601()
      .withMessage('Please provide a valid date'),
    body('storeName')
      .trim()
      .notEmpty()
      .withMessage('Store name is required'),
    body('storeAddressLine1')
      .trim()
      .notEmpty()
      .withMessage('Store address line 1 is required'),
    body('pinCode')
      .trim()
      .notEmpty()
      .withMessage('PIN code is required')
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('ifsc')
      .trim()
      .notEmpty()
      .withMessage('IFSC code is required')
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Please provide a valid IFSC code'),
    body('accountNumber')
      .trim()
      .notEmpty()
      .withMessage('Account number is required'),
    body('bankName')
      .optional()
      .trim(),
    body('bank_name')
      .optional()
      .trim(),
    body().custom((value, { req }) => {
      const bankName = (req.body.bankName || req.body.bank_name || '').trim();
      if (!bankName) {
        throw new Error('Bank name is required');
      }
      return true;
    }),
  ],
  createVendor
);

router.get('/', protect, getVendors);

router.get('/:id', protect, getVendor);

router.put(
  '/:id/permissions',
  protect,
  [
    body('permissions')
      .optional()
      .custom((value) => {
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return false;
          }
        }
        return typeof value === 'object';
      })
      .withMessage('Permissions must be a valid JSON object'),
  ],
  updateVendorPermissions
);

router.put(
  '/:id',
  protect,
  uploadFields,
  [
    body('vendorName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Vendor name cannot be empty'),
    body('contactNumber')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
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
    body('storeName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Store name cannot be empty'),
    body('storeAddressLine1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Store address line 1 cannot be empty'),
    body('pinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('ifsc')
      .optional()
      .trim()
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Please provide a valid IFSC code'),
    body('accountNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Account number cannot be empty'),
    body('bankName')
      .optional()
      .trim(),
    body('bank_name')
      .optional()
      .trim(),
    body('permissions')
      .optional()
      .custom((value) => {
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return false;
          }
        }
        return typeof value === 'object';
      })
      .withMessage('Permissions must be a valid JSON object'),
  ],
  updateVendor
);

router.put('/:id/suspend', protect, suspendVendor);

router.delete('/:id', protect, deleteVendor);

module.exports = router;

