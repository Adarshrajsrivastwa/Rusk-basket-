const checkoutService = require('../services/checkoutService');
const cashbackService = require('../services/cashbackService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.getCart = async (req, res, next) => {
  try {
    // Ensure we're getting cart for the authenticated user only
    const userId = req.user._id;
    logger.info(`Fetching cart for user: ${userId}`);

    const dropoff = await checkoutService.resolveDropoffCoordinatesForCart(req.query, userId);
    const result = await checkoutService.getCartWithTotals(userId, {
      latitude: dropoff.latitude,
      longitude: dropoff.longitude,
      dropoffSource: dropoff.source,
    });
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
        const dropoff = await checkoutService.resolveDropoffCoordinatesForCart(req.query, userId);
        const updatedCart = await checkoutService.getCartWithTotals(userId, {
          latitude: dropoff.latitude,
          longitude: dropoff.longitude,
          dropoffSource: dropoff.source,
        });
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

    // Refetch cart to get the updated totalPrice after calculateTotals
    const Cart = require('../models/Cart');
    const updatedCart = await Cart.findById(cart._id).populate('coupon.couponId');

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        cart: updatedCart,
        ...totals,
        couponDiscount: totals.pricing.couponDiscount || 0, // Explicitly show coupon discount amount
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

    // Refetch cart to get the updated totalPrice after calculateTotals
    const Cart = require('../models/Cart');
    const updatedCart = await Cart.findById(cart._id);

    res.status(200).json({
      success: true,
      message: 'Coupon removed successfully',
      data: {
        cart: updatedCart,
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

exports.applyCashback = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { cashbackAmount } = req.body;
    const userId = req.user._id;
    logger.info(`Applying cashback to cart for user: ${userId}, amount: ${cashbackAmount}`);

    const result = await cashbackService.applyCashbackToCart(userId, cashbackAmount);

    res.status(200).json({
      success: true,
      message: 'Cashback applied successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Apply cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply cashback',
    });
  }
};

exports.removeCashback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    logger.info(`Removing cashback from cart for user: ${userId}`);

    const result = await cashbackService.removeCashbackFromCart(userId);

    res.status(200).json({
      success: true,
      message: 'Cashback removed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Remove cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove cashback',
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

    const { shippingAddress: addressString, lat, long, paymentMethod, notes, deliveryInstruction, callbackUrl: userCallbackUrl } = req.body;

    // Ensure we're creating order from the authenticated user's cart only
    const userId = req.user._id;
    logger.info(`Creating order from cart for user: ${userId}`);

    const User = require('../models/User');
    const user = await User.findById(userId).select('contactNumber address addresses');

    if (!user || !user.contactNumber) {
      return res.status(400).json({
        success: false,
        error: 'User contact number not found. Please update your profile.',
      });
    }

    const pickSavedShippingAddress = () => {
      const list = Array.isArray(user.addresses) ? user.addresses : [];
      const hasCoords = (a) => a && a.latitude != null && a.longitude != null;

      let a = list.find((x) => x.isDefault && hasCoords(x));
      if (!a) a = list.find((x) => hasCoords(x));
      if (!a && user.address && hasCoords(user.address)) a = user.address;
      return a || null;
    };

    const savedAddress = pickSavedShippingAddress();
    let shippingAddress;

    if (savedAddress) {
      // Use saved user address (preferred). No dependency on frontend lat/long.
      shippingAddress = {
        line1: savedAddress.line1 || '',
        line2: savedAddress.line2 || '',
        pinCode: savedAddress.pinCode || '',
        city: savedAddress.city || '',
        state: savedAddress.state || '',
        phone: user.contactNumber,
        latitude: savedAddress.latitude,
        longitude: savedAddress.longitude,
      };
    } else {
      // Fallback: parse the address string: "line1, city, pinCode" and enrich with post office data.
      if (!addressString) {
        return res.status(400).json({
          success: false,
          error: 'No saved address found. Please add an address in your profile (with latitude & longitude) or send shippingAddress.',
        });
      }

      const addressParts = String(addressString || '').split(',').map(part => part.trim());
      if (addressParts.length < 3) {
        return res.status(400).json({
          success: false,
          error: 'Invalid address format. Expected format: "Address Line, City, PIN Code"',
        });
      }

      const line1 = addressParts[0];
      const city = addressParts[1];
      const pinCode = addressParts[2];

      if (!/^[0-9]{6}$/.test(pinCode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid PIN code format. Must be 6 digits',
        });
      }

      const { getPostOfficeDetails } = require('../utils/postOfficeAPI');
      const postOfficeData = await getPostOfficeDetails(pinCode);
      if (!postOfficeData.success) {
        return res.status(400).json({
          success: false,
          error: postOfficeData.error || 'Invalid PIN code. Could not fetch location details.',
        });
      }

      shippingAddress = {
        line1,
        line2: '',
        pinCode,
        city: postOfficeData.city || city,
        state: postOfficeData.state,
        phone: user.contactNumber,
        latitude: lat ? parseFloat(lat) : undefined,
        longitude: long ? parseFloat(long) : undefined,
      };
    }

    // Combine notes and deliveryInstruction
    let combinedNotes = '';
    if (notes) {
      combinedNotes = notes.trim();
    }
    if (deliveryInstruction) {
      if (combinedNotes) {
        combinedNotes += `\n\nDelivery Instruction: ${deliveryInstruction.trim()}`;
      } else {
        combinedNotes = `Delivery Instruction: ${deliveryInstruction.trim()}`;
      }
    }

    // Carry forward the delivery amount computed on /api/checkout/cart (single source of truth).
    // If delivery can't be computed, it will stay 0 and order will still be placed.
    const cartTotals = await checkoutService.getCartWithTotals(userId, {
      latitude: shippingAddress.latitude,
      longitude: shippingAddress.longitude,
      dropoffSource: 'order_create',
    });

    const legs = cartTotals?.deliveryEstimate?.legs || [];
    const maxDistanceKm = legs.reduce((max, leg) => {
      const d = Number(leg?.distanceKm);
      if (!Number.isFinite(d)) return max;
      return Math.max(max, d);
    }, 0);

    // Simple ETA heuristic (tunable): base 45 mins + 8 mins per km, clamped.
    const etaMinutesRaw = 45 + maxDistanceKm * 8;
    const etaMinutes = Math.max(45, Math.min(240, Math.round(etaMinutesRaw)));
    const estimatedDelivery = new Date(Date.now() + etaMinutes * 60 * 1000);

    const order = await checkoutService.createOrder(
      userId,
      shippingAddress,
      paymentMethod,
      combinedNotes || undefined,
      {
        deliveryAmount: cartTotals?.pricing?.deliveryAmount ?? 0,
        estimatedDelivery,
      }
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

    // Initialize payment link for prepaid payments (not COD)
    // Uses the same payment-link approach as /api/payment/create-payment-link
    let paymentLinkResult = null;
    let paymentError = null;
    if (paymentMethod !== 'cod') {
      try {
        const { getActivePaymentGateway, createRazorpayPaymentLink } = require('../services/paymentService');
        const crypto = require('crypto');
        const axios = require('axios');
        const PaymentGateway = require('../models/PaymentGateway');
        const User = require('../models/User');
        const user = await User.findById(userId).select('email userName');

        const gateway = await getActivePaymentGateway();

        let credentials = { ...gateway.credentials };
        if (gateway.testMode && gateway.testCredentials) {
          Object.keys(gateway.testCredentials).forEach(key => {
            if (gateway.testCredentials[key] && gateway.testCredentials[key].trim()) {
              credentials[key] = gateway.testCredentials[key];
            }
          });
        }

        const callbackUrl = userCallbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`;

        if (gateway.name === 'razorpay') {
          const linkData = {
            amount: order.payment.amount,
            currency: 'INR',
            description: `Payment for Order ${order.orderNumber}`,
            name: user?.userName || '',
            email: user?.email || '',
            contact: shippingAddress.phone || '',
            callbackUrl,
            callbackMethod: 'get',
            notes: { orderId: order._id.toString(), orderNumber: order.orderNumber, userId: userId.toString() },
            notify: { sms: true, email: true },
          };
          const result = await createRazorpayPaymentLink(linkData, credentials);
          order.payment.transactionId = result.paymentLinkId;
          await order.save();
          paymentLinkResult = { payment_url: result.payment_url, gateway: 'razorpay', amount: result.amount, referenceId: result.referenceId, paymentLinkId: result.paymentLinkId };

        } else if (gateway.name === 'phonepay') {
          const baseUrl = gateway.testMode
            ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
            : 'https://api.phonepe.com/apis/hermes';
          const merchantTransactionId = `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
          const amountInPaise = Math.round(order.payment.amount * 100);
          const payload = {
            merchantId: credentials.phonepayMerchantId,
            merchantTransactionId,
            merchantUserId: userId.toString(),
            amount: amountInPaise,
            redirectUrl: callbackUrl,
            redirectMode: 'REDIRECT',
            callbackUrl: `${process.env.API_URL || 'http://localhost:3000'}/api/payment/phonepay/callback`,
            mobileNumber: shippingAddress.phone || '',
            paymentInstrument: { type: 'PAY_PAGE' },
          };
          const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
          const sha256Hash = crypto.createHash('sha256').update(`${base64Payload}/pg/v1/pay${credentials.phonepaySaltKey}`).digest('hex');
          const xVerify = `${sha256Hash}###${credentials.phonepaySaltIndex || '1'}`;
          const response = await axios.post(`${baseUrl}/pg/v1/pay`, { request: base64Payload }, {
            headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify, Accept: 'application/json' },
          });
          if (response.data?.success && response.data?.data) {
            order.payment.transactionId = merchantTransactionId;
            await order.save();
            paymentLinkResult = {
              payment_url: response.data.data.instrumentResponse.redirectInfo.url,
              gateway: 'phonepay',
              amount: amountInPaise / 100,
            };
          } else {
            throw new Error('PhonePe payment initialization failed');
          }

        } else if (gateway.name === 'cashfree') {
          const appId = (credentials.cashfreeAppId || '').trim();
          const secretKey = (credentials.cashfreeSecretKey || '').trim();
          const isTest = appId.toUpperCase().startsWith('TEST');
          const cfBaseUrl = isTest ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';
          const apiVersion = credentials.cashfreeApiVersion || '2023-08-01';
          const cfOrderId = `order_${Date.now()}`;
          const amountInPaise = Math.round(order.payment.amount * 100);
          const cfPayload = {
            order_id: cfOrderId,
            order_amount: amountInPaise,
            order_currency: 'INR',
            customer_details: {
              customer_id: userId.toString(),
              customer_email: user?.email || 'test@gmail.com',
              customer_phone: shippingAddress.phone || '9999999999',
            },
            order_meta: { return_url: callbackUrl + `?order_id=${cfOrderId}` },
          };
          const cfResponse = await axios.post(`${cfBaseUrl}/orders`, cfPayload, {
            headers: { 'Content-Type': 'application/json', 'x-api-version': apiVersion, 'x-client-id': appId, 'x-client-secret': secretKey },
            timeout: 15000,
          });
          if (cfResponse.data?.payment_session_id) {
            let sessionId = String(cfResponse.data.payment_session_id).trim().replace(/\s+/g, '');
            const domain = isTest ? 'sandbox.cashfree.com' : 'cashfree.com';
            const paymentUrl = cfResponse.data.payment_link || `https://${domain}/pg/view/payment/${sessionId}`;
            order.payment.transactionId = cfOrderId;
            await order.save();
            paymentLinkResult = { payment_url: paymentUrl, gateway: 'cashfree', amount: amountInPaise / 100 };
          } else {
            throw new Error('Cashfree payment initialization failed');
          }

        } else {
          throw new Error(`Unsupported payment gateway: ${gateway.name}`);
        }

        logger.info(`Payment link created for order ${order.orderNumber} via ${paymentLinkResult.gateway}`);
      } catch (err) {
        paymentError = err.message || 'Payment initialization failed';
        logger.error('Payment link creation error:', {
          message: err.message,
          stack: err.stack,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        });
      }
    }

    // For prepaid: return only payment URL (like /api/payment/create-payment-link)
    if (paymentMethod !== 'cod' && paymentLinkResult) {
      const responseData = {
        success: true,
        message: 'Order created. Complete payment to confirm.',
        payment_url: paymentLinkResult.payment_url,
        gateway: paymentLinkResult.gateway,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        amount: order.payment.amount,
        currency: 'INR',
      };
      if (paymentLinkResult.referenceId) {
        responseData.referenceId = paymentLinkResult.referenceId;
      }
      if (paymentLinkResult.paymentLinkId) {
        responseData.paymentLinkId = paymentLinkResult.paymentLinkId;
      }
      return res.status(201).json(responseData);
    }

    if (paymentMethod !== 'cod' && paymentError) {
      let userFriendlyError = paymentError;
      if (paymentError.includes('key_id') || paymentError.includes('Key ID')) {
        userFriendlyError = 'Razorpay credentials are missing or invalid. Please configure Razorpay Key ID and Key Secret in admin panel.';
      } else if (paymentError.includes('No payment gateway')) {
        userFriendlyError = 'No payment gateway is enabled. Please enable a payment gateway from admin panel.';
      }

      return res.status(201).json({
        success: true,
        message: 'Order created but payment initialization failed. Retry via /api/payment/retry.',
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        amount: order.payment.amount,
        payment: {
          error: userFriendlyError,
          canRetry: true,
          retryEndpoint: '/api/payment/retry',
        },
      });
    }

    // COD: return full order data
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

    // Return in same format as getOrders endpoint
    res.status(200).json({
      success: true,
      orders: [order], // Wrap in array to match /orders format
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

    // Ensure deliveryImage and deliveredImage are included in response
    const responseData = {
      ...order,
      deliveryImage: order.deliveryImage || null,
      deliveredImage: order.deliveredImage || null,
    };

    // If rider is assigned, include rider name, mobile number, and delivery amount
    // Check riderDetails first (from assignmentRequestSentTo or order.rider), then fallback to order.rider
    if (order.riderDetails || order.rider) {
      const riderDetails = order.riderDetails;
      const rider = order.rider;

      responseData.riderInfo = {
        name: riderDetails?.riderName || rider?.fullName || null,
        mobileNumber: riderDetails?.mobileNumber || rider?.mobileNumber || null,
        deliveryAmount: order.deliveryAmount || order.pricing?.deliveryAmount || 0,
      };
    }

    res.status(200).json({
      success: true,
      data: responseData,
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
    const { riderId, notes } = req.body;

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
    // Note: Wallet update now happens on payment verification, not on status change
    // Note: Delivery charge is now automatically calculated at order creation based on distance
    // No manual deliveryAmount input required

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

/**
 * Confirm order as COD
 * Sets payment method to COD and payment status to pending
 */
exports.confirmCOD = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    // Find the order
    const Order = require('../models/Order');
    const order = await Order.findOne({ _id: orderId, user: userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Update payment details
    order.payment.method = 'cod';
    order.payment.status = 'pending';

    // Set order status to order_placed to initiate workflow
    order.status = 'order_placed';

    await order.save();

    logger.info(`Order confirmed as COD: ${order.orderNumber} by User: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Order confirmed as Cash on Delivery',
      data: order,
    });
  } catch (error) {
    logger.error('Confirm COD error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to confirm COD order',
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




