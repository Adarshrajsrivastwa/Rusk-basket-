const express = require('express');
const { body, query } = require('express-validator');
const {
  createJobPost,
  getJobPosts,
  getJobPost,
  updateJobPost,
  deleteJobPost,
  toggleJobPostStatus,
} = require('../controllers/riderJobPost');
const { protect: protectVendor } = require('../middleware/vendorAuth');
const { protect: protectAdmin } = require('../middleware/adminAuth');

const router = express.Router();

router.post(
  '/create',
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

router.post(
  '/admin/create',
  protectAdmin,
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
    body('vendor')
      .notEmpty()
      .withMessage('Vendor ID is required when creating job post as admin')
      .isMongoId()
      .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
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

router.get(
  '/',
  [
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
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
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  getJobPosts
);

router.get(
  '/admin/all',
  protectAdmin,
  [
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
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
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  getJobPosts
);

router.get('/:id', getJobPost);

router.put(
  '/:id',
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

router.delete(
  '/:id',
  protectVendor,
  deleteJobPost
);

router.patch(
  '/:id/toggle-status',
  protectVendor,
  toggleJobPostStatus
);

module.exports = router;

