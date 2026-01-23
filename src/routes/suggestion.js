const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createSuggestion,
  getSuggestions,
  getSuggestion,
  updateSuggestion,
  deleteSuggestion,
} = require('../controllers/suggestion');
const { protect } = require('../middleware/adminAuth');

const router = express.Router();

// Public route - anyone can create suggestions
router.post(
  '/create',
  [
    body('text')
      .trim()
      .notEmpty()
      .withMessage('Suggestion text is required')
      .isLength({ max: 5000 })
      .withMessage('Suggestion text cannot be more than 5000 characters'),
  ],
  createSuggestion
);

// Admin-only routes below

// Admin-only: Get all suggestions
router.get(
  '/',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getSuggestions
);

// Admin-only: Get single suggestion
router.get(
  '/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Suggestion ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid suggestion ID'),
  ],
  getSuggestion
);

// Admin-only: Update suggestion
router.put(
  '/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Suggestion ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid suggestion ID'),
    body('text')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Suggestion text cannot be empty')
      .isLength({ max: 5000 })
      .withMessage('Suggestion text cannot be more than 5000 characters'),
  ],
  updateSuggestion
);

// Admin-only: Delete suggestion
router.delete(
  '/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Suggestion ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid suggestion ID'),
  ],
  deleteSuggestion
);

module.exports = router;
