const express = require('express');
const { body } = require('express-validator');
const {
  createSubCategory,
  getSubCategories,
  getSubCategory,
  updateSubCategory,
  deleteSubCategory,
  toggleSubCategoryStatus,
  getSubCategoriesByCategory,
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
  ],
  updateSubCategory
);

router.delete('/:id', protect, deleteSubCategory);

router.patch('/:id/toggle-status', protect, toggleSubCategoryStatus);

module.exports = router;

