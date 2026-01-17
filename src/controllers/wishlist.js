const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.getWishlist = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login to access your wishlist.',
      });
    }

    const userId = req.user._id;
    logger.info(`Fetching wishlist for user: ${userId}`);

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, items: [] });
    }

    if (wishlist.user.toString() !== userId.toString()) {
      logger.warn(`Unauthorized wishlist access attempt: User ${userId} tried to access wishlist ${wishlist._id}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only access your own wishlist.',
      });
    }

    const result = await wishlist.getWishlistWithDetails();

    if (result.unavailableItems && result.unavailableItems.length > 0) {
      const availableItemIds = result.items.map(item => item.itemId.toString());
      wishlist.items = wishlist.items.filter(item => 
        availableItemIds.includes(item._id.toString())
      );
      await wishlist.save();

      return res.status(200).json({
        success: true,
        message: `${result.unavailableItems.length} item(s) in your wishlist are no longer available and have been removed`,
        data: {
          items: result.items,
          totalItems: result.totalItems,
        },
        warnings: result.unavailableItems,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        totalItems: result.totalItems,
      },
    });
  } catch (error) {
    logger.error('Get wishlist error:', error);
    next(error);
  }
};

exports.addToWishlist = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login to add items to your wishlist.',
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      const contentType = req.headers['content-type'] || 'not set';
      logger.warn('Empty or unparsed request body in addToWishlist:', {
        contentType,
        contentLength: req.headers['content-length'],
        body: req.body,
      });
      return res.status(400).json({
        success: false,
        error: 'Request body is empty or not properly formatted. Please ensure Content-Type is "application/json" and send valid JSON data.',
        hint: contentType.includes('javascript') 
          ? 'Content-Type is set to "application/javascript" but should be "application/json". Please update your request headers.'
          : 'Please check that your request body contains valid JSON and the Content-Type header is set correctly.',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation errors in addToWishlist:', {
        errors: errors.array(),
        body: req.body,
        contentType: req.headers['content-type'],
      });
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { productId } = req.body;
    
    if (!productId) {
      logger.warn('ProductId missing after validation:', { body: req.body });
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }
    const userId = req.user._id;

    logger.info(`Adding product ${productId} to wishlist for user: ${userId}`);

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    let wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, items: [] });
    }

    if (wishlist.user.toString() !== userId.toString()) {
      logger.warn(`Unauthorized wishlist access attempt: User ${userId} tried to modify wishlist ${wishlist._id}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only modify your own wishlist.',
      });
    }

    const existingItem = wishlist.items.find(
      item => item.product.toString() === productId.toString()
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        error: 'Product already exists in wishlist',
      });
    }

    wishlist.items.push({
      product: productId,
      addedAt: new Date(),
    });

    await wishlist.save();

    const result = await wishlist.getWishlistWithDetails();

    res.status(200).json({
      success: true,
      message: 'Product added to wishlist successfully',
      data: {
        items: result.items,
        totalItems: result.totalItems,
      },
    });
  } catch (error) {
    logger.error('Add to wishlist error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to add product to wishlist',
    });
  }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login to remove items from your wishlist.',
      });
    }

    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }

    const userId = req.user._id;
    logger.info(`Removing product ${productId} from wishlist for user: ${userId}`);

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        error: 'Wishlist not found',
      });
    }

    if (wishlist.user.toString() !== userId.toString()) {
      logger.warn(`Unauthorized wishlist access attempt: User ${userId} tried to modify wishlist ${wishlist._id}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only modify your own wishlist.',
      });
    }

    const itemIndex = wishlist.items.findIndex(
      item => item.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Product not found in wishlist',
      });
    }

    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    const result = await wishlist.getWishlistWithDetails();

    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist successfully',
      data: {
        items: result.items,
        totalItems: result.totalItems,
      },
    });
  } catch (error) {
    logger.error('Remove from wishlist error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove product from wishlist',
    });
  }
};

exports.clearWishlist = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login to clear your wishlist.',
      });
    }

    const userId = req.user._id;
    logger.info(`Clearing wishlist for user: ${userId}`);

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        error: 'Wishlist not found',
      });
    }

    if (wishlist.user.toString() !== userId.toString()) {
      logger.warn(`Unauthorized wishlist access attempt: User ${userId} tried to clear wishlist ${wishlist._id}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only clear your own wishlist.',
      });
    }

    wishlist.items = [];
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully',
      data: {
        items: [],
        totalItems: 0,
      },
    });
  } catch (error) {
    logger.error('Clear wishlist error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to clear wishlist',
    });
  }
};

exports.checkWishlistItem = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login to check your wishlist.',
      });
    }

    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }

    const userId = req.user._id;

    const wishlist = await Wishlist.findOne({ user: userId });

    if (wishlist && wishlist.user.toString() !== userId.toString()) {
      logger.warn(`Unauthorized wishlist access attempt: User ${userId} tried to check wishlist ${wishlist._id}`);
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only check your own wishlist.',
      });
    }

    if (!wishlist) {
      return res.status(200).json({
        success: true,
        data: {
          isInWishlist: false,
        },
      });
    }

    const isInWishlist = wishlist.items.some(
      item => item.product.toString() === productId.toString()
    );

    res.status(200).json({
      success: true,
      data: {
        isInWishlist,
      },
    });
  } catch (error) {
    logger.error('Check wishlist item error:', error);
    next(error);
  }
};
