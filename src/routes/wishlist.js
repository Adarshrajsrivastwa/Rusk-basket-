const express = require('express');
const { body, param } = require('express-validator');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlistItem,
} = require('../controllers/wishlist');
const { protect } = require('../middleware/userAuth');

const router = express.Router();

router.use(protect);

router.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/add') {
    const contentType = req.headers['content-type'] || '';
    
    if ((contentType.includes('javascript') || contentType.includes('text/plain')) && 
        (!req.body || Object.keys(req.body).length === 0)) {
      
      if (req.rawBody) {
        try {
          req.body = JSON.parse(req.rawBody);
          return next();
        } catch (e) {
        }
      }
      
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body could not be parsed. Please ensure Content-Type header is set to "application/json".',
          hint: `Current Content-Type is "${contentType}". Please change it to "application/json" in your request headers.`,
          example: {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer <your-token>'
            },
            body: {
              productId: '696233bac692e3662beb1fac'
            }
          }
        });
      }
    }
  }
  next();
});

router.get('/', getWishlist);

router.post(
  '/add',
  [
    body('productId')
      .exists()
      .withMessage('Product ID is required')
      .bail()
      .notEmpty()
      .withMessage('Product ID cannot be empty')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
  ],
  addToWishlist
);

router.delete(
  '/remove/:productId',
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
  ],
  removeFromWishlist
);

router.delete('/clear', clearWishlist);

router.get(
  '/check/:productId',
  [
    param('productId')
      .notEmpty()
      .withMessage('Product ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid product ID'),
  ],
  checkWishlistItem
);

module.exports = router;
