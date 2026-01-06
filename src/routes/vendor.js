const express = require('express');
const { body } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/vendorOTP');
const { createVendor, getVendors, getVendor, updateVendorPermissions, updateVendorDocuments, updateVendorRadius, suspendVendor, deleteVendor, getVendorOrders, getVendorOrderById, updateOrderStatus, assignRiderToOrder } = require('../controllers/vendor');
const { protect } = require('../middleware/adminAuth');
const { protectVendorOrAdmin } = require('../middleware/vendorOrAdminAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');
const { uploadFields } = require('../middleware/upload');

const router = express.Router();

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

const normalizeBodyFields = (req, res, next) => {
  if (req.body) {
    const normalizedBody = {};
    for (const [key, value] of Object.entries(req.body)) {
      const normalizedKey = key.trim();
      if (!normalizedBody[normalizedKey] || normalizedKey === key) {
        normalizedBody[normalizedKey] = value;
      }
    }
    req.body = normalizedBody;
  }
  next();
};

router.post(
  '/create',
  protect,
  normalizeBodyFields,
  uploadFields,
  [
    body('vendorName')
      .trim()
      .notEmpty()
      .withMessage('Vendor name is required')
      .bail(),
    body('contactNumber')
      .trim()
      .notEmpty()
      .withMessage('Contact number is required')
      .bail()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .bail()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('Gender is required')
      .bail()
      .isIn(['male', 'female', 'other'])
      .withMessage('Gender must be male, female, or other'),
    body('dateOfBirth')
      .notEmpty()
      .withMessage('Date of birth is required')
      .bail()
      .isISO8601()
      .withMessage('Please provide a valid date'),
    body('storeName')
      .trim()
      .notEmpty()
      .withMessage('Store name is required')
      .bail(),
    body('storeAddressLine1')
      .trim()
      .notEmpty()
      .withMessage('Store address line 1 is required')
      .bail(),
    body('pinCode')
      .trim()
      .notEmpty()
      .withMessage('PIN code is required')
      .bail()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('ifsc')
      .trim()
      .notEmpty()
      .withMessage('IFSC code is required')
      .bail()
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Please provide a valid IFSC code'),
    body('accountNumber')
      .trim()
      .notEmpty()
      .withMessage('Account number is required')
      .bail(),
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

router.get('/orders', protectVendor, getVendorOrders);

router.put(
  '/orders/:id/status',
  protectVendor,
  [
    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .bail()
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid status'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot be more than 1000 characters'),
  ],
  updateOrderStatus
);

router.put(
  '/orders/:orderId/assign-rider',
  protectVendor,
  [
    body('riderId')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
    body('assignmentNotes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Assignment notes cannot be more than 1000 characters'),
    body('updateStatus')
      .optional()
      .isBoolean()
      .withMessage('updateStatus must be a boolean'),
  ],
  assignRiderToOrder
);

router.get('/orders/:id', protectVendor, getVendorOrderById);

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
  '/:id/documents',
  protect,
  uploadFields,
  updateVendorDocuments
);

router.put(
  '/:id/radius',
  protectVendorOrAdmin,
  [
    body('serviceRadius')
      .notEmpty()
      .withMessage('Service radius is required')
      .bail()
      .isFloat({ min: 0.1 })
      .withMessage('Service radius must be a number greater than or equal to 0.1 km'),
  ],
  updateVendorRadius
);

router.put('/:id/suspend', protect, suspendVendor);

router.delete('/:id', protect, deleteVendor);

module.exports = router;

