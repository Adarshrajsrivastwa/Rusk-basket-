const express = require('express');
const { body, query } = require('express-validator');
const {
  createBanner,
  getBanners,
  getBanner,
  deleteBanner,
  toggleBannerStatus,
} = require('../controllers/banner');
const { protect } = require('../middleware/adminAuth');
const { uploadSingle } = require('../middleware/bannerUpload');

const router = express.Router();

// Public routes - anyone can get banners
router.get(
  '/',
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
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],
  getBanners
);

router.get('/:id', getBanner);

// Admin only routes - create and delete banners
router.post(
  '/create',
  protect,
  uploadSingle,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Banner name cannot be more than 200 characters'),
  ],
  createBanner
);

router.delete('/:id', protect, deleteBanner);

router.patch('/:id/toggle-status', protect, toggleBannerStatus);

module.exports = router;

