const express = require('express');
const { body } = require('express-validator');
const {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
} = require('../controllers/category');
const { protect } = require('../middleware/superadminAuth');
const { uploadSingle } = require('../middleware/categoryUpload');

const router = express.Router();

router.post(
  '/create',
  protect,
  uploadSingle,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Category name is required')
      .isLength({ max: 100 })
      .withMessage('Category name cannot be more than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot be more than 1000 characters'),
  ],
  createCategory
);

router.get('/', getCategories);

router.get('/:id', getCategory);

router.put(
  '/:id',
  protect,
  uploadSingle,
  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Category name cannot be empty')
      .isLength({ max: 100 })
      .withMessage('Category name cannot be more than 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot be more than 1000 characters'),
  ],
  updateCategory
);

router.delete('/:id', protect, deleteCategory);

router.patch('/:id/toggle-status', protect, toggleCategoryStatus);

module.exports = router;

