const express = require('express');
const { body } = require('express-validator');
const {
  createJobPost,
  getJobPosts,
  getJobPost,
  updateJobPost,
  deleteJobPost,
  toggleJobPostStatus,
} = require('../controllers/riderJobPost');
const { protect: protectVendor } = require('../middleware/vendorAuth');

const router = express.Router();

// Create job post - Only Vendor can post
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

// Get all job posts - Public or filtered by vendor
router.get('/', getJobPosts);

// Get single job post
router.get('/:id', getJobPost);

// Update job post - Only Vendor (vendor can only update their own)
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

// Delete job post - Only Vendor (vendor can only delete their own)
router.delete(
  '/:id',
  protectVendor,
  deleteJobPost
);

// Toggle job post status - Only Vendor (vendor can only toggle their own)
router.patch(
  '/:id/toggle-status',
  protectVendor,
  toggleJobPostStatus
);

module.exports = router;

