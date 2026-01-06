const express = require('express');
const { body } = require('express-validator');
const {
  applyForJob,
  getMyApplications,
  getJobApplications,
  reviewApplication,
  getApplication,
} = require('../controllers/riderJobApplication');
const { protect: protectRider } = require('../middleware/riderAuth');
const { protect: protectVendor } = require('../middleware/vendorAuth');

const router = express.Router();

// Rider routes - Specific routes must come before parameterized routes
// Apply for a job
router.post(
  '/apply',
  protectRider,
  [
    body('jobPostId')
      .notEmpty()
      .withMessage('Job post ID is required')
      .isMongoId()
      .withMessage('Invalid job post ID'),
  ],
  applyForJob
);

// Get rider's own applications
router.get('/my-applications', protectRider, getMyApplications);

// Vendor routes - Specific routes must come before parameterized routes
// Get applications for a specific job post
router.get('/job/:jobPostId', protectVendor, getJobApplications);

// Review application (approve/reject) - Must come before /:applicationId
router.put(
  '/:applicationId/review',
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

// Get single application (rider can view their own) - Must be last as it's parameterized
router.get('/:applicationId', protectRider, getApplication);

module.exports = router;

