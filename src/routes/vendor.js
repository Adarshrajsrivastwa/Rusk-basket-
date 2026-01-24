const express = require('express');
const { body, query } = require('express-validator');
const { sendOTP, verifyOTP } = require('../controllers/vendorOTP');
const { vendorLogout } = require('../controllers/vendorAuth');
const { createVendor, getVendors, getVendor, updateVendorPermissions, updateVendorDocuments, updateVendorRadius, updateVendorHandlingCharge, suspendVendor, deleteVendor, getVendorOrders, getVendorOrderById, updateOrderStatus, assignRiderToOrder, updateVendorProfile, getVendorProfile } = require('../controllers/vendor');
const { addItemsToOrder } = require('../controllers/checkout');
const { getVendorProducts } = require('../controllers/productGet');
const { createJobPost, getJobPosts, getJobPost, updateJobPost, deleteJobPost, toggleJobPostStatus, getMyJobPosts } = require('../controllers/riderJobPost');
const { getAllVendorApplications, getJobApplications, reviewApplication, assignRider, getAssignedRiders, getApplication } = require('../controllers/riderJobApplication');
const { updateInventory, getInventory, getAllInventory } = require('../controllers/inventory');
const { toggleProductOffer, getVendorOffers, getProductOffer } = require('../controllers/productOffer');
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
    body('serviceRadius')
      .optional()
      .isFloat({ min: 0.1 })
      .withMessage('Service radius must be a number greater than or equal to 0.1 km'),
    body('handlingChargePercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Handling charge percentage must be between 0 and 100'),
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
    body('deliveryAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Delivery amount must be a number greater than or equal to 0'),
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

router.post(
  '/order/:orderId/items',
  protectVendor,
  [
    body('items')
      .isArray({ min: 1 })
      .withMessage('Items must be a non-empty array'),
    body('items.*.productId')
      .notEmpty()
      .withMessage('Product ID is required for each item')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
    body('items.*.quantity')
      .notEmpty()
      .withMessage('Quantity is required for each item')
      .bail()
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),
    body('items.*.sku')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('SKU cannot be empty if provided'),
  ],
  addItemsToOrder
);

router.get('/products', protectVendor, getVendorProducts);

// Get vendor's own job posts (vendor ID extracted from token)
router.get(
  '/my-job-posts',
  protectVendor,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('isActive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isActive must be either "true" or "false"'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Search query cannot exceed 200 characters'),
    query('city')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('City cannot exceed 100 characters'),
    query('state')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('State cannot exceed 100 characters'),
    query('pinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('PIN code must be a valid 6-digit number'),
  ],
  getMyJobPosts
);

router.post(
  '/job-posts/create',
  protectVendor,
  [
    body('jobTitle')
      .trim()
      .notEmpty()
      .withMessage('Job title is required')
      .isLength({ max: 200 })
      .withMessage('Job title cannot be more than 200 characters'),
    body('joiningBonus')
      .notEmpty()
      .withMessage('Joining bonus is required')
      .isFloat({ min: 0 })
      .withMessage('Joining bonus must be a number greater than or equal to 0'),
    body('onboardingFee')
      .notEmpty()
      .withMessage('Onboarding fee is required')
      .isFloat({ min: 0 })
      .withMessage('Onboarding fee must be a number greater than or equal to 0'),
    body('locationLine1')
      .trim()
      .notEmpty()
      .withMessage('Location address line 1 is required'),
    body('locationPinCode')
      .trim()
      .notEmpty()
      .withMessage('PIN code is required')
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('locationLine2')
      .optional()
      .trim(),
    body('locationCity')
      .optional()
      .trim(),
    body('locationState')
      .optional()
      .trim(),
    body('locationLatitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('locationLongitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
  ],
  createJobPost
);

router.get('/job-posts', protectVendor, getJobPosts);

router.get('/job-posts/:id', protectVendor, getJobPost);

router.put(
  '/job-posts/:id',
  protectVendor,
  [
    body('jobTitle')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Job title cannot be empty')
      .isLength({ max: 200 })
      .withMessage('Job title cannot be more than 200 characters'),
    body('joiningBonus')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Joining bonus must be a number greater than or equal to 0'),
    body('onboardingFee')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Onboarding fee must be a number greater than or equal to 0'),
    body('locationLine1')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Location address line 1 cannot be empty'),
    body('locationPinCode')
      .optional()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage('Please provide a valid 6-digit PIN code'),
    body('locationLine2')
      .optional()
      .trim(),
    body('locationCity')
      .optional()
      .trim(),
    body('locationState')
      .optional()
      .trim(),
    body('locationLatitude')
      .optional()
      .isFloat()
      .withMessage('Latitude must be a valid number'),
    body('locationLongitude')
      .optional()
      .isFloat()
      .withMessage('Longitude must be a valid number'),
  ],
  updateJobPost
);

router.delete('/job-posts/:id', protectVendor, deleteJobPost);

router.patch('/job-posts/:id/toggle-status', protectVendor, toggleJobPostStatus);

router.get('/job-applications', protectVendor, getAllVendorApplications);

router.get('/job-posts/:jobPostId/applications', protectVendor, getJobApplications);

router.get('/job-applications/:applicationId', protectVendor, getApplication);

router.put(
  '/job-applications/:applicationId/review',
  protectVendor,
  [
    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .isIn(['approved', 'rejected'])
      .withMessage('Status must be either "approved" or "rejected"'),
    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot be more than 500 characters'),
  ],
  reviewApplication
);

router.put(
  '/job-applications/:applicationId/assign',
  protectVendor,
  [
    body('assignmentNotes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Assignment notes cannot be more than 1000 characters'),
  ],
  assignRider
);

router.get('/job-posts/:jobPostId/assigned-riders', protectVendor, getAssignedRiders);

router.get(
  '/inventory',
  protectVendor,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Search term cannot exceed 200 characters'),
  ],
  getAllInventory
);

router.get('/inventory/:id', protectVendor, getInventory);

router.put(
  '/inventory/:id',
  protectVendor,
  [
    body('inventory')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Inventory must be a number greater than or equal to 0'),
    body('action')
      .optional()
      .isIn(['add', 'subtract', 'set'])
      .withMessage('Action must be one of: add, subtract, set'),
    body('skus')
      .optional()
      .isArray()
      .withMessage('SKUs must be an array'),
    body('skus.*.sku')
      .if(body('skus').exists())
      .trim()
      .notEmpty()
      .withMessage('Each SKU must have a valid sku string'),
    body('skus.*.inventory')
      .if(body('skus').exists())
      .isFloat({ min: 0 })
      .withMessage('Each SKU inventory must be a number greater than or equal to 0'),
    body().custom((value, { req }) => {
      if (!req.body.inventory && (!req.body.skus || !Array.isArray(req.body.skus) || req.body.skus.length === 0)) {
        throw new Error('Either inventory or skus must be provided');
      }
      return true;
    }),
  ],
  updateInventory
);

// Profile routes (protected - vendor can get and update their own profile)
// Must be placed before /:id route to ensure proper matching
router.get('/profile', protectVendor, getVendorProfile);

router.put(
  '/profile',
  protectVendor,
  uploadFields,
  [
    body('vendorName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Vendor name cannot be empty'),
    body('altContactNumber')
      .optional()
      .trim()
      .matches(/^[0-9]{10}$/)
      .withMessage('Please provide a valid 10-digit contact number'),
    body('email')
      .optional()
      .trim()
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
    body('storeAddressLine2')
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
      .trim()
      .notEmpty()
      .withMessage('Bank name cannot be empty'),
    body('bank_name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Bank name cannot be empty'),
    body('serviceRadius')
      .optional()
      .isFloat({ min: 0.1 })
      .withMessage('Service radius must be a number greater than or equal to 0.1 km'),
    body('handlingChargePercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Handling charge percentage must be between 0 and 100'),
    body('contactNumber')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Contact number cannot be updated through this endpoint');
        }
        return true;
      }),
  ],
  updateVendorProfile
);

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

router.put(
  '/:id/handling-charge',
  protectVendorOrAdmin,
  [
    body('handlingChargePercentage')
      .notEmpty()
      .withMessage('Handling charge percentage is required')
      .bail()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Handling charge percentage must be between 0 and 100'),
  ],
  updateVendorHandlingCharge
);

router.put('/:id/suspend', protect, suspendVendor);

router.delete('/:id', protect, deleteVendor);

// Product Offer Routes
router.put(
  '/products/:productId/offer',
  protectVendor,
  [
    body('offerEnabled')
      .optional()
      .isBoolean()
      .withMessage('offerEnabled must be a boolean'),
    body('offerDiscountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount percentage must be between 0 and 100'),
    body('offerStartDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('offerEndDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('isDailyOffer')
      .optional()
      .isBoolean()
      .withMessage('isDailyOffer must be a boolean'),
  ],
  toggleProductOffer
);

router.get(
  '/products/offers',
  protectVendor,
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
      .isIn(['all', 'active', 'upcoming', 'expired', 'enabled'])
      .withMessage('Status must be one of: all, active, upcoming, expired, enabled'),
  ],
  getVendorOffers
);

router.get('/products/:productId/offer', protectVendor, getProductOffer);

// Logout route (protected)
router.post('/logout', protectVendor, vendorLogout);

module.exports = router;

