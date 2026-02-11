const checkoutService = require('../services/checkoutService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.getCart = async (req, res, next) => {
  try {
    // Ensure we're getting cart for the authenticated user only
    const userId = req.user._id;
    logger.info(`Fetching cart for user: ${userId}`);
    
    const result = await checkoutService.getCartWithTotals(userId);
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

    // Ensure we're adding to the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Adding product ${productId} to cart for user: ${userId}`);

    const cart = await checkoutService.addToCart(
      userId,
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

exports.updateCartItem = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }
    const itemId = req.params.itemId || req.query.itemId;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required. Use /cart/item/:itemId or /cart/item?itemId=...',
      });
    }

    const { quantity } = req.body;
    
    // Ensure we're updating cart for the authenticated user only
    const userId = req.user._id;
    logger.info(`Updating cart item ${itemId} for user: ${userId}`);

    try {
      const cart = await checkoutService.updateCartItem(
        userId,
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
      if (updateError.message.includes('removed from cart')) {
        const updatedCart = await checkoutService.getCartWithTotals(userId);
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
    // Check if it's an authorization error
    if (error.message.includes('Unauthorized') || error.message.includes('does not belong')) {
      return res.status(403).json({
        success: false,
        error: error.message || 'You do not have permission to update this cart item',
      });
    }
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update cart item',
    });
  }
};

exports.removeFromCart = async (req, res, next) => {
  try {
    const itemId = req.params.itemId || req.query.itemId;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'Item ID is required. Use /cart/item/:itemId or /cart/item?itemId=...',
      });
    }

    // Ensure we're removing from the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Removing cart item ${itemId} for user: ${userId}`);

    const cart = await checkoutService.removeFromCart(userId, itemId);

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
    // Check if it's an authorization error
    if (error.message.includes('Unauthorized') || error.message.includes('does not belong')) {
      return res.status(403).json({
        success: false,
        error: error.message || 'You do not have permission to remove this cart item',
      });
    }
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove item from cart',
    });
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    // Ensure we're clearing the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Clearing cart for user: ${userId}`);
    
    const cart = await checkoutService.clearCart(userId);

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart,
    });
  } catch (error) {
    logger.error('Clear cart error:', error);
    // Check if it's an authorization error
    if (error.message.includes('Unauthorized') || error.message.includes('does not belong')) {
      return res.status(403).json({
        success: false,
        error: error.message || 'You do not have permission to clear this cart',
      });
    }
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to clear cart',
    });
  }
};

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

    // Ensure we're applying coupon to the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Applying coupon ${couponCode} to cart for user: ${userId}`);

    const cart = await checkoutService.applyCoupon(userId, couponCode);

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

exports.removeCoupon = async (req, res, next) => {
  try {
    // Ensure we're removing coupon from the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Removing coupon from cart for user: ${userId}`);
    
    const cart = await checkoutService.removeCoupon(userId);

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

    // Ensure we're creating order from the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Creating order from cart for user: ${userId}`);

    const order = await checkoutService.createOrder(
      userId,
      shippingAddress,
      paymentMethod,
      notes
    );

    logger.info(`Order created: ${order.orderNumber} by User: ${req.user._id}`);

    // Send push notification to user about order creation
    try {
      const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
      await sendOrderStatusNotification(userId, {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'order_placed',
      });
    } catch (pushError) {
      logger.error('Error sending push notification for order creation:', pushError);
      // Don't fail the request if push notification fails
    }

    // Initialize payment gateway for prepaid payments (not COD)
    let paymentData = null;
    let paymentError = null;
    if (paymentMethod !== 'cod') {
      try {
        const { initializePayment } = require('../services/paymentService');
        const User = require('../models/User');
        const user = await User.findById(userId).select('email');

        const orderData = {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          userId: userId.toString(),
          amount: order.payment.amount,
          email: user?.email || '',
          phone: shippingAddress.phone,
          shippingAddress: shippingAddress,
          items: order.items.map(item => ({
            title: item.productName,
            quantity: item.quantity,
            price: item.salePrice || item.unitPrice,
          })),
          redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
        };

        paymentData = await initializePayment(orderData);

        // Update order with payment gateway transaction ID
        order.payment.transactionId = paymentData.orderId || paymentData.merchantTransactionId || paymentData.checkoutId;
        await order.save();

        logger.info(`Payment initialized for order ${order.orderNumber}`);
      } catch (err) {
        paymentError = err.message || 'Payment initialization failed';
        logger.error('Payment initialization error:', {
          message: err.message,
          stack: err.stack,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber
        });
        // Don't fail order creation if payment initialization fails
        // Payment can be initialized later via /api/payment/initialize
      }
    }

    const responseData = {
      success: true,
      message: 'Order created successfully',
      data: order,
    };

    // Include payment data if payment was initialized
    if (paymentData) {
      responseData.payment = {
        gateway: paymentData.paymentGateway,
        orderId: paymentData.orderId || paymentData.merchantTransactionId || paymentData.checkoutId,
        redirectUrl: paymentData.redirectUrl,
        keyId: paymentData.keyId,
        checkoutUrl: paymentData.checkoutUrl,
        // Frontend ke liye gateway-specific structured data
        frontendData: paymentData.frontendData || {
          gateway: paymentData.paymentGateway,
          orderId: paymentData.orderId || paymentData.merchantTransactionId || paymentData.checkoutId,
          redirectUrl: paymentData.redirectUrl,
          keyId: paymentData.keyId,
          amount: paymentData.amount,
        },
      };
    } else if (paymentMethod !== 'cod' && paymentError) {
      // If payment initialization failed, include error message
      // Remove sensitive error details but keep helpful message
      let userFriendlyError = paymentError;
      if (paymentError.includes('key_id') || paymentError.includes('Key ID')) {
        userFriendlyError = 'Razorpay credentials are missing or invalid. Please configure Razorpay Key ID and Key Secret in admin panel.';
      } else if (paymentError.includes('No payment gateway')) {
        userFriendlyError = 'No payment gateway is enabled. Please enable a payment gateway from admin panel.';
      }
      
      responseData.payment = {
        error: userFriendlyError,
        message: 'Payment gateway initialization failed. You can retry payment using /api/payment/retry endpoint.',
        canRetry: true,
        retryEndpoint: '/api/payment/retry',
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
      };
    }

    res.status(201).json(responseData);
  } catch (error) {
    logger.error('Create order error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create order',
    });
  }
};

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

exports.getVendorOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    let order;

    // If admin, get full order without vendor restriction
    if (req.admin) {
      order = await checkoutService.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }
    } else if (req.vendor) {
      // If vendor, get order with vendor restriction
      order = await checkoutService.getVendorOrderById(orderId, req.vendor._id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found or does not belong to this vendor',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Vendor or Admin privileges required.',
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
    const { status, deliveryAmount } = req.body;

    const order = await checkoutService.updateOrderStatus(orderId, req.vendor._id, status, deliveryAmount);

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

exports.markOutForDelivery = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;
    const { deliveryAmount, riderId, notes } = req.body;

    // Get order and validate it belongs to vendor
    const Order = require('../models/Order');
    const order = await Order.findById(orderId)
      .populate('items.vendor', '_id');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Check if order belongs to this vendor
    const vendorItems = order.items.filter(item => 
      item.vendor && item.vendor._id.toString() === req.vendor._id.toString()
    );

    if (vendorItems.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Order does not belong to this vendor',
      });
    }

    // Validate that order is in a valid state to be marked as out for delivery
    // Order should be in 'confirmed', 'processing', or 'ready' status
    const validStatuses = ['confirmed', 'processing', 'ready', 'rider_assign'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Order cannot be marked as out for delivery. Current status: ${order.status}. Order must be in 'confirmed', 'processing', 'ready', or 'rider_assign' status.`,
      });
    }

    // Update order status to out_for_delivery
    const previousStatus = order.status;
    order.status = 'out_for_delivery';

    // Update deliveryAmount if provided
    if (deliveryAmount !== undefined) {
      const deliveryAmountNum = parseFloat(deliveryAmount);
      if (isNaN(deliveryAmountNum) || deliveryAmountNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'Delivery amount must be a valid positive number',
        });
      }
      
      // Save deliveryAmount and riderAmount ONLY in pricing object (not at top level)
      // Ensure pricing object exists
      if (!order.pricing) {
        order.pricing = {};
      }
      
      // Directly assign to pricing object
      order.pricing.deliveryAmount = deliveryAmountNum;
      order.pricing.riderAmount = deliveryAmountNum; // riderAmount is same as deliveryAmount (what rider earns)
      
      // Remove top-level deliveryAmount field
      order.deliveryAmount = undefined;
      
      // Update pricing.total = subtotal - discount + tax + handlingCharge + deliveryAmount
      if (order.pricing.subtotal !== undefined && order.pricing.subtotal !== null) {
        const subtotal = order.pricing.subtotal || 0;
        const discount = order.pricing.discount || 0;
        const tax = order.pricing.tax || 0;
        const handlingCharge = order.pricing.handlingCharge || 0;
        const deliveryAmt = deliveryAmountNum;
        
        order.pricing.total = parseFloat((subtotal - discount + tax + handlingCharge + deliveryAmt).toFixed(2));
        
        // Also update payment.amount to match the new total
        if (order.payment) {
          order.payment.amount = order.pricing.total;
        }
      }
      
      // Mark pricing as modified so Mongoose tracks the changes (CRITICAL for nested objects)
      order.markModified('pricing');
      if (order.payment) {
        order.markModified('payment');
      }
    }

    // Update rider if provided
    if (riderId) {
      const Rider = require('../models/Rider');
      const rider = await Rider.findById(riderId);
      if (!rider) {
        return res.status(400).json({
          success: false,
          error: 'Rider not found',
        });
      }
      order.rider = riderId;
      if (!order.assignedAt) {
        order.assignedAt = new Date();
      }
      order.assignedBy = req.vendor._id;
    }

    // Add notes if provided
    if (notes) {
      if (order.assignmentNotes) {
        order.assignmentNotes += `\n${notes}`;
      } else {
        order.assignmentNotes = notes;
      }
    }

    await order.save();

    // Send push notification to user
    if (order.user) {
      try {
        const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
        await sendOrderStatusNotification(order.user, {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'out_for_delivery',
        });
      } catch (pushError) {
        logger.error('Error sending push notification for out for delivery:', pushError);
      }
    }

    // Get populated order for response
    const updatedOrder = await Order.findById(order._id)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail')
      .populate('items.vendor', 'storeName storeId')
      .populate('coupon.couponId', 'couponName code')
      .populate('rider', 'fullName mobileNumber');

    logger.info(`Order marked as out for delivery: ${order.orderNumber} by Vendor: ${req.vendor.storeId}`);

    res.status(200).json({
      success: true,
      message: 'Order marked as out for delivery successfully',
      data: updatedOrder,
      previousStatus: previousStatus,
      newStatus: 'out_for_delivery',
    });
  } catch (error) {
    logger.error('Mark out for delivery error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to mark order as out for delivery',
    });
  }
};

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

exports.addItemsToOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and must not be empty',
      });
    }

    const order = await checkoutService.addItemsToOrder(
      orderId,
      req.vendor._id,
      items
    );

    logger.info(`Items added to order ${order.orderNumber} by Vendor: ${req.vendor.storeId || req.vendor._id}`);

    res.status(200).json({
      success: true,
      message: 'Items added to order successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Add items to order error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to add items to order',
    });
  }
};

exports.reorder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;

    // Ensure we're reordering for the authenticated user only
    const userId = req.user._id;
    logger.info(`Reordering order ${orderId} for user: ${userId}`);

    const order = await checkoutService.reorder(userId, orderId);

    logger.info(`Order reordered: ${order.orderNumber} by User: ${req.user._id}`);

    res.status(201).json({
      success: true,
      message: 'Order reordered successfully',
      data: order,
    });
  } catch (error) {
    logger.error('Reorder error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to reorder',
    });
  }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filters = {};
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.user) {
      filters.user = req.query.user;
    }
    
    if (req.query.vendor) {
      filters.vendor = req.query.vendor;
    }
    
    if (req.query.paymentStatus) {
      filters.paymentStatus = req.query.paymentStatus;
    }
    
    if (req.query.paymentMethod) {
      filters.paymentMethod = req.query.paymentMethod;
    }
    
    if (req.query.startDate) {
      filters.startDate = req.query.startDate;
    }
    
    if (req.query.endDate) {
      filters.endDate = req.query.endDate;
    }
    
    if (req.query.search) {
      filters.search = req.query.search;
    }

    const result = await checkoutService.getAllOrders(page, limit, filters);

    res.status(200).json({
      success: true,
      count: result.orders.length,
      ...result,
    });
  } catch (error) {
    logger.error('Get all orders error:', error);
    next(error);
  }
};

exports.getOrderInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const mongoose = require('mongoose');
    const Order = require('../models/Order');
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    let order;
    let hasAccess = false;
    if (req.user) {
      order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
      })
        .populate('user', 'userName email contactNumber address')
        .populate('items.product', 'productName skuHsn')
        .populate('items.vendor', 'vendorName storeName storeAddress contactNumber email')
        .populate('rider', 'fullName mobileNumber')
        .populate('assignedBy', 'vendorName storeName')
        .lean();

      if (order) {
        hasAccess = true;
      }
    }

    if (!hasAccess && req.vendor) {
      order = await Order.findOne({
        _id: orderId,
        'items.vendor': req.vendor._id,
      })
        .populate('user', 'userName email contactNumber address')
        .populate('items.product', 'productName skuHsn')
        .populate('items.vendor', 'vendorName storeName storeAddress contactNumber email')
        .populate('rider', 'fullName mobileNumber')
        .populate('assignedBy', 'vendorName storeName')
        .lean();

      if (order) {
        hasAccess = true;
        order.items = order.items.filter((item) => {
          const itemVendorId = item.vendor?._id || item.vendor;
          return itemVendorId && itemVendorId.toString() === req.vendor._id.toString();
        });
      }
    }

    if (!hasAccess && req.admin) {
      order = await Order.findById(orderId)
        .populate('user', 'userName email contactNumber address')
        .populate('items.product', 'productName skuHsn')
        .populate('items.vendor', 'vendorName storeName storeAddress contactNumber email')
        .populate('rider', 'fullName mobileNumber')
        .populate('assignedBy', 'vendorName storeName')
        .lean();

      if (order) {
        hasAccess = true;
      }
    }

    if (!hasAccess || !order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or you do not have permission to view this invoice',
      });
    }

    let invoiceSubtotal = order.pricing.subtotal;
    let invoiceDiscount = order.pricing.discount;
    let invoiceTax = order.pricing.tax;
    let invoiceHandlingCharge = order.pricing.handlingCharge || 0;
    let invoiceTotal = order.pricing.total;
    let invoiceCashback = order.pricing.totalCashback;

    if (req.vendor && order.items && order.items.length > 0) {
      invoiceSubtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
      invoiceCashback = order.items.reduce((sum, item) => sum + (item.cashback || 0), 0);
      const vendorItemPercentage = invoiceSubtotal / order.pricing.subtotal;
      invoiceDiscount = order.pricing.discount * vendorItemPercentage;
      invoiceTax = order.pricing.tax * vendorItemPercentage;
      invoiceHandlingCharge = (order.pricing.handlingCharge || 0) * vendorItemPercentage;
      invoiceTotal = invoiceSubtotal - invoiceDiscount + invoiceTax + invoiceHandlingCharge;
    }

    const invoice = {
      invoiceNumber: order.orderNumber,
      invoiceDate: order.createdAt,
      orderDate: order.createdAt,
      deliveryDate: order.deliveredAt || order.estimatedDelivery,
      customer: {
        name: order.user?.userName || 'N/A',
        email: order.user?.email || 'N/A',
        contactNumber: order.user?.contactNumber || 'N/A',
        address: order.shippingAddress,
      },

      vendors: req.vendor 
        ? [{
            name: order.items[0]?.vendor?.vendorName || 'N/A',
            storeName: order.items[0]?.vendor?.storeName || 'N/A',
            contactNumber: order.items[0]?.vendor?.contactNumber || 'N/A',
            email: order.items[0]?.vendor?.email || 'N/A',
            address: order.items[0]?.vendor?.storeAddress || {},
          }]
        : [...new Set(order.items.map(item => {
            const vendor = item.vendor?._id || item.vendor;
            return vendor?.toString();
          }))].map(vendorId => {
            const vendorItem = order.items.find(item => {
              const itemVendorId = item.vendor?._id || item.vendor;
              return itemVendorId?.toString() === vendorId;
            });
            return {
              name: vendorItem?.vendor?.vendorName || 'N/A',
              storeName: vendorItem?.vendor?.storeName || 'N/A',
              contactNumber: vendorItem?.vendor?.contactNumber || 'N/A',
              email: vendorItem?.vendor?.email || 'N/A',
              address: vendorItem?.vendor?.storeAddress || {},
            };
          }),
      items: order.items.map((item) => ({
        productName: item.productName,
        sku: item.sku || item.product?.skuHsn || 'N/A',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        salePrice: item.salePrice,
        totalPrice: item.totalPrice,
        cashback: item.cashback || 0,
        vendor: req.vendor ? undefined : {
          name: item.vendor?.vendorName || 'N/A',
          storeName: item.vendor?.storeName || 'N/A',
        },
      })),
      pricing: {
        subtotal: invoiceSubtotal,
        discount: invoiceDiscount,
        tax: invoiceTax,
        handlingCharge: invoiceHandlingCharge,
        total: invoiceTotal,
        totalCashback: invoiceCashback,
      },
      payment: {
        method: order.payment.method,
        status: order.payment.status,
        amount: order.payment.amount,
        transactionId: order.payment.transactionId || 'N/A',
        paidAt: order.payment.paidAt,
      },
      coupon: order.coupon?.code ? {
        code: order.coupon.code,
        discount: order.coupon.discount,
      } : null,

      status: order.status,
      rider: order.rider ? {
        name: order.rider.fullName || 'N/A',
        mobileNumber: order.rider.mobileNumber || 'N/A',
        assignedAt: order.assignedAt,
      } : null,
      notes: order.notes || null,
      cancellationReason: order.cancellationReason || null,
      cancelledAt: order.cancelledAt || null,
    };

    logger.info(`Invoice generated for order ${order.orderNumber} by ${req.user ? 'User' : req.vendor ? 'Vendor' : 'Admin'}`);

    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Get order invoice error:', error);
    next(error);
  }
};




