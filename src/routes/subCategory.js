const express = require('express');
const { body, query } = require('express-validator');
const {
  createSubCategory,
  getSubCategories,
  getSubCategory,
  updateSubCategory,
  deleteSubCategory,
  toggleSubCategoryStatus,
  getSubCategoriesByCategory,
  getSubCategoriesByLocation,
} = require('../controllers/subCategory');
const { protect } = require('../middleware/adminAuth');
const { uploadSingle } = require('../middleware/subCategoryUpload');

const router = express.Router();

router.post(
  '/create',
  protect,
  uploadSingle,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('SubCategory name is required')
      .isLength({ max: 100 })
      .withMessage('SubCategory name cannot be more than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot be more than 1000 characters'),
    body('category')
      .notEmpty()
      .withMessage('Parent category is required')
      .isMongoId()
      .withMessage('Invalid category ID'),
  ],
  createSubCategory
);

router.get('/', getSubCategories);

router.get(
  '/by-location',
  [
    query('latitude')
      .notEmpty()
      .withMessage('Latitude is required')
      .bail()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be a number between -90 and 90'),
    query('longitude')
      .notEmpty()
      .withMessage('Longitude is required')
      .bail()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be a number between -180 and 180'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 1000 })
      .withMessage('Radius must be a number between 0.1 and 1000 km'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
  ],
  getSubCategoriesByLocation
);

router.get('/by-category/:categoryId', getSubCategoriesByCategory);

router.get('/:id', getSubCategory);

router.put(
  '/:id',
  protect,
  uploadSingle,
  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('SubCategory name cannot be empty')
      .isLength({ max: 100 })
      .withMessage('SubCategory name cannot be more than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot be more than 1000 characters'),
    body('category')
      .optional()
      .isMongoId()
      .withMessage('Invalid category ID'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean value'),
  ],
  updateSubCategory
);

router.delete('/:id', protect, deleteSubCategory);

router.patch('/:id/toggle-status', protect, toggleSubCategoryStatus);

module.exports = router;

