const checkoutService = require('../services/checkoutService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Get cart with totals
 */
exports.getCart = async (req, res, next) => {
  try {
    const result = await checkoutService.getCartWithTotals(req.user._id);

    // If there are unavailable items, include a warning message
    if (result.unavailableItems && result.unavailableItems.length > 0) {
      return res.status(200).json({
        success: true,
        message: `${result.unavailableItems.length} item(s) in your cart are no longer available and have been removed`,
        data: result,
        warnings: result.unavailableItems,
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Get cart error:', error);
    next(error);
  }
};

/**
 * Add item to cart
 */
exports.addToCart = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { productId, quantity, sku } = req.body;

    const cart = await checkoutService.addToCart(
      req.user._id,
      productId,
      quantity,
      sku
    );

    const totals = await cart.calculateTotals();

    res.status(200).json({
      success: true,
      message: 'Item added to cart successfully',
      data: {
        cart,
        ...totals,
      },
    });
  } catch (error) {
    logger.error('Add to cart error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to add item to cart',
    });
  }
};

/**
 * Update cart item quantity
 */
exports.updateCartItem = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Support both path parameter and query parameter for itemId
    const itemId = req.params.itemId || req.query.itemId;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required. Use /cart/item/:itemId or /cart/item?itemId=...',
      });
    }

    const { quantity } = req.body;

    try {
      const cart = await checkoutService.updateCartItem(
        req.user._id,
        itemId,
        quantity
      );

      const totals = await cart.calculateTotals();

      res.status(200).json({
        success: true,
        message: 'Cart item updated successfully',
        data: {
          cart,
          ...totals,
        },
      });
    } catch (updateError) {
      // If item was removed from cart, get updated cart and return it
      if (updateError.message.includes('removed from cart')) {
        const updatedCart = await checkoutService.getCartWithTotals(req.user._id);
        return res.status(400).json({
          success: false,
          error: updateError.message,
          data: updatedCart,
        });
      }
      throw updateError;
    }
  } catch (error) {
    logger.error('Update cart item error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update cart item',
    });
  }
};

/**
 * Remove item from cart
 */
exports.removeFromCart = async (req, res, next) => {
  try {
    // Support both path parameter and query parameter for itemId
    const itemId = req.params.itemId || req.query.itemId;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required. Use /cart/item/:itemId or /cart/item?itemId=...',
      });
    }

    const cart = await checkoutService.removeFromCart(req.user._id, itemId);

    const totals = await cart.calculateTotals();

    res.status(200).json({
      success: true,
      message: 'Item removed from cart successfully',
      data: {
        cart,
        ...totals,
      },
    });
  } catch (error) {
    logger.error('Remove from cart error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove item from cart',
    });
  }
};

/**
 * Clear cart
 */
exports.clearCart = async (req, res, next) => {
  try {
    const cart = await checkoutService.clearCart(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart,
    });
  } catch (error) {
    logger.error('Clear cart error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to clear cart',
    });
  }
};

/**
 * Apply coupon to cart
 */
exports.applyCoupon = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { couponCode } = req.body;

    const cart = await checkoutService.applyCoupon(req.user._id, couponCode);

    const totals = await cart.calculateTotals();

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        cart,
        ...totals,
      },
    });
  } catch (error) {
    logger.error('Apply coupon error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply coupon',
    });
  }
};

/**
 * Remove coupon from cart
 */
exports.removeCoupon = async (req, res, next) => {
  try {
    const cart = await checkoutService.removeCoupon(req.user._id);

    const totals = await cart.calculateTotals();

    res.status(200).json({
      success: true,
      message: 'Coupon removed successfully',
      data: {
        cart,
        ...totals,
      },
    });
  } catch (error) {
    logger.error('Remove coupon error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove coupon',
    });
  }
};

/**
 * Create order from cart
 */
exports.createOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { shippingAddress, paymentMethod, notes } = req.body;

    const order = await checkoutService.createOrder(
      req.user._id,
      shippingAddress,
      paymentMethod,
      notes
    );

    logger.info(`Order created: ${order.orderNumber} by User: ${req.user._id}`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Create order error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create order',
    });
  }
};

/**
 * Get user orders
 */
exports.getOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || null;

    const result = await checkoutService.getUserOrders(
      req.user._id,
      page,
      limit,
      status
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Get orders error:', error);
    next(error);
  }
};

/**
 * Get order by ID
 */
exports.getOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await checkoutService.getOrderById(orderId, req.user._id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Get order error:', error);
    next(error);
  }
};

/**
 * Get vendor orders
 */
exports.getVendorOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || null;

    const result = await checkoutService.getVendorOrders(
      req.vendor._id,
      page,
      limit,
      status
    );

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Get vendor orders error:', error);
    next(error);
  }
};

/**
 * Get vendor order by ID
 */
exports.getVendorOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await checkoutService.getVendorOrderById(orderId, req.vendor._id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or does not belong to this vendor',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Get vendor order error:', error);
    next(error);
  }
};

/**
 * Update order status (vendor)
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;
    const { status } = req.body;

    const order = await checkoutService.updateOrderStatus(orderId, req.vendor._id, status);

    logger.info(`Order status updated: ${order.orderNumber} to ${status} by Vendor: ${req.vendor.storeId}`);

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Update order status error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update order status',
    });
  }
};

/**
 * Cancel order
 */
exports.cancelOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await checkoutService.cancelOrder(orderId, req.user._id, reason);

    logger.info(`Order cancelled: ${order.orderNumber} by User: ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Cancel order error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to cancel order',
    });
  }
};

