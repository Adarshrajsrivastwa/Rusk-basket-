const express = require('express');
const { body, param, query } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const {
  initializePayment,
  verifyPayment,
  getActivePaymentGateway,
  getAllEnabledGateways,
  createRazorpayPaymentLink,
} = require('../services/paymentService');
const { protect } = require('../middleware/userAuth');
const logger = require('../utils/logger');
const Order = require('../models/Order');
const PaymentGateway = require('../models/PaymentGateway');

const router = express.Router();

/**
 * Helper function to update vendor wallets when payment is verified
 * Formula: Total Amount - Delivery Charge - Commission = Vendor Wallet Amount
 */
const updateVendorWalletsOnPaymentVerification = async (order) => {
  try {
    const Vendor = require('../models/Vendor');
    const mongoose = require('mongoose');
    
    // Get unique vendor IDs from order items
    const vendorIds = [...new Set(order.items.map(item => {
      const vendorId = item.vendor?._id || item.vendor;
      return vendorId ? vendorId.toString() : null;
    }).filter(Boolean))];

    // Process each vendor
    for (const vendorIdStr of vendorIds) {
      try {
        // Get vendor items
        const vendorItems = order.items.filter(item => {
          const itemVendorId = item.vendor?._id || item.vendor;
          return itemVendorId && itemVendorId.toString() === vendorIdStr;
        });

        if (vendorItems.length === 0) continue;

        // Calculate vendor's total amount from items
        let vendorTotalAmount = 0;
        vendorItems.forEach(item => {
          const itemTotal = item.totalPrice || (item.unitPrice || item.salePrice || 0) * (item.quantity || 0);
          vendorTotalAmount += itemTotal;
        });

        // Add proportional handling charge if applicable
        if (order.pricing?.handlingCharge && order.pricing?.subtotal && order.pricing.subtotal > 0) {
          const vendorSubtotal = vendorItems.reduce((sum, item) => {
            const itemTotal = item.totalPrice || (item.unitPrice || item.salePrice || 0) * (item.quantity || 0);
            return sum + itemTotal;
          }, 0);
          const handlingChargeRatio = vendorSubtotal / order.pricing.subtotal;
          const vendorHandlingCharge = (order.pricing.handlingCharge || 0) * handlingChargeRatio;
          vendorTotalAmount += vendorHandlingCharge;
        }

        // Calculate proportional delivery charge
        let deliveryCharge = 0;
        if (order.pricing?.deliveryAmount && order.pricing?.subtotal && order.pricing.subtotal > 0) {
          const vendorSubtotal = vendorItems.reduce((sum, item) => {
            const itemTotal = item.totalPrice || (item.unitPrice || item.salePrice || 0) * (item.quantity || 0);
            return sum + itemTotal;
          }, 0);
          const deliveryChargeRatio = vendorSubtotal / order.pricing.subtotal;
          deliveryCharge = (order.pricing.deliveryAmount || 0) * deliveryChargeRatio;
        }

        // Get vendor to calculate commission
        const vendor = await Vendor.findById(vendorIdStr);
        if (!vendor) {
          logger.warn(`Vendor ${vendorIdStr} not found for order ${order.orderNumber}`);
          continue;
        }

        // Calculate commission based on vendor's commission type
        let commissionAmount = 0;
        const commission = vendor.commission || { type: 'percentage', percentage: 10, fixedAmount: 0 };
        
        if (commission.type === 'percentage') {
          commissionAmount = (vendorTotalAmount * (commission.percentage || 10)) / 100;
        } else if (commission.type === 'fixed') {
          commissionAmount = commission.fixedAmount || 0;
        } else if (commission.type === 'hybrid') {
          // Hybrid: percentage + fixed
          const percentageCommission = (vendorTotalAmount * (commission.percentage || 10)) / 100;
          commissionAmount = percentageCommission + (commission.fixedAmount || 0);
        } else if (commission.type === 'subscription') {
          // For subscription commission type:
          // - Monthly subscription fee is deducted separately on scheduled date
          // - Per order commission is 0 (subscription already covers it)
          commissionAmount = 0;
        }

        // Calculate vendor wallet amount: Total Amount - Delivery Charge - Commission
        const vendorWalletAmount = vendorTotalAmount - deliveryCharge - commissionAmount;

        // Check if already credited for this order
        const alreadyCredited = vendor.walletTransactions?.some(
          txn => txn.orderId && txn.orderId.toString() === order._id.toString() && 
                 txn.type === 'credit' && 
                 txn.description && txn.description.includes('Payment verified')
        );

        if (!alreadyCredited && vendorWalletAmount > 0) {
          // Update vendor's earning wallet
          const updatedVendor = await Vendor.findOneAndUpdate(
            { _id: vendorIdStr },
            {
              $inc: { earningWallet: vendorWalletAmount },
              $push: {
                walletTransactions: {
                  type: 'credit',
                  amount: vendorWalletAmount,
                  orderId: order._id,
                  orderNumber: order.orderNumber,
                  description: `Payment verified for order ${order.orderNumber}. Total: ₹${vendorTotalAmount.toFixed(2)}, Delivery: ₹${deliveryCharge.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}, Added: ₹${vendorWalletAmount.toFixed(2)}`,
                  createdAt: new Date(),
                }
              }
            },
            {
              new: true,
              runValidators: true,
            }
          );

          if (updatedVendor) {
            logger.info(`Payment verified: Added ₹${vendorWalletAmount.toFixed(2)} to vendor ${vendorIdStr} wallet for order ${order.orderNumber} (Total: ₹${vendorTotalAmount.toFixed(2)}, Delivery: ₹${deliveryCharge.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)})`);
          }
        }
      } catch (vendorError) {
        logger.error(`Error updating vendor ${vendorIdStr} wallet for order ${order.orderNumber}:`, vendorError);
        // Continue with other vendors even if one fails
      }
    }
  } catch (walletError) {
    logger.error('Error updating vendor wallets after payment verification:', walletError);
    // Don't throw error, just log it
  }
};

/**
 * Initialize payment for an order
 */
router.post(
  '/initialize',
  protect,
  [
    body('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
  ],
  async (req, res, next) => {
    try {
      const errors = require('express-validator').validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orderId } = req.body;
      const userId = req.user._id;

      // Get order and verify ownership
      const order = await Order.findOne({ _id: orderId, user: userId });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      if (order.payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Payment already completed for this order',
        });
      }

      // Prepare order data for payment
      const orderData = {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        userId: userId.toString(),
        amount: order.payment.amount,
        email: req.user.email,
        phone: order.shippingAddress.phone,
        shippingAddress: order.shippingAddress,
        items: order.items.map(item => ({
          title: item.productName,
          quantity: item.quantity,
          price: item.salePrice,
        })),
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
      };

      // Initialize payment
      const paymentResult = await initializePayment(orderData);

      // Update order with payment gateway info
      order.payment.transactionId = paymentResult.orderId || paymentResult.merchantTransactionId || paymentResult.checkoutId;
      order.payment.status = 'processing';
      await order.save();

      logger.info(`Payment initialized for order ${order.orderNumber} using ${paymentResult.paymentGateway}`);

      res.status(200).json({
        success: true,
        message: 'Payment initialized successfully',
        data: {
          ...paymentResult,
          // Frontend ke liye structured response
          frontendData: paymentResult.frontendData || {
            gateway: paymentResult.paymentGateway,
            orderId: paymentResult.orderId || paymentResult.merchantTransactionId || paymentResult.checkoutId,
            redirectUrl: paymentResult.redirectUrl,
            keyId: paymentResult.keyId,
            amount: paymentResult.amount,
          },
        },
      });
    } catch (error) {
      logger.error('Initialize payment error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to initialize payment',
      });
    }
  }
);

/**
 * Verify payment (callback from payment gateway)
 */
router.post(
  '/verify',
  protect,
  [
    body('orderId')
      .optional()
      .isMongoId()
      .withMessage('Invalid order ID format (must be MongoDB ObjectId)'),
    body('paymentData')
      .notEmpty()
      .withMessage('Payment data is required')
      .bail()
      .isObject()
      .withMessage('Payment data must be an object'),
    body('gateway')
      .notEmpty()
      .withMessage('Payment gateway is required')
      .bail()
      .isIn(['razorpay', 'phonepay', 'shopify', 'cashfree'])
      .withMessage('Invalid payment gateway'),
  ],
  async (req, res, next) => {
    try {
      const errors = require('express-validator').validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orderId, paymentData, gateway } = req.body;
      const userId = req.user._id;
      let order = null;

      // For Razorpay Payment Link flow: If orderId not provided, try to get it from payment link
      if (!orderId && gateway === 'razorpay' && paymentData.razorpay_payment_link_id) {
        try {
          // Get payment gateway credentials
          const PaymentGateway = require('../models/PaymentGateway');
          const paymentGateway = await PaymentGateway.findOne({ 
            name: 'razorpay', 
            isEnabled: true 
          });

          if (paymentGateway) {
            let credentials = { ...paymentGateway.credentials };
            if (paymentGateway.testMode && paymentGateway.testCredentials) {
              Object.keys(paymentGateway.testCredentials).forEach(key => {
                if (paymentGateway.testCredentials[key] && paymentGateway.testCredentials[key].trim()) {
                  credentials[key] = paymentGateway.testCredentials[key];
                }
              });
            }

            // Fetch payment link details from Razorpay to get orderId from notes
            const Razorpay = require('razorpay');
            const razorpay = new Razorpay({
              key_id: credentials.razorpayKeyId.trim(),
              key_secret: credentials.razorpayKeySecret.trim(),
            });

            const paymentLink = await razorpay.paymentLink.fetch(paymentData.razorpay_payment_link_id);
            
            // Extract orderId from notes
            if (paymentLink.notes && paymentLink.notes.orderId) {
              const extractedOrderId = paymentLink.notes.orderId;
              
              // Find order by extracted orderId
              order = await Order.findOne({ _id: extractedOrderId, user: userId });
              
              if (!order) {
                return res.status(404).json({
                  success: false,
                  error: 'Order not found. Please provide orderId in request body.',
                });
              }
            } else {
              return res.status(400).json({
                success: false,
                error: 'Order ID not found in payment link. Please provide orderId in request body.',
              });
            }
          }
        } catch (linkError) {
          logger.error('Error fetching payment link details:', linkError);
          return res.status(400).json({
            success: false,
            error: 'Could not fetch payment link details. Please provide orderId in request body.',
          });
        }
      } else if (orderId) {
        // Get order by provided orderId
        order = await Order.findOne({ _id: orderId, user: userId });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Order ID is required. Please provide orderId in request body.',
        });
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found or you do not have permission to access this order',
        });
      }

      if (order.payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Payment already completed for this order',
        });
      }

      // Verify payment
      const verificationResult = await verifyPayment(paymentData, gateway);

      if (verificationResult.success) {
        // Update order payment status
        order.payment.status = 'completed';
        order.payment.transactionId = verificationResult.paymentId || verificationResult.orderId || verificationResult.merchantTransactionId;
        order.payment.paidAt = new Date();
        order.payment.method = gateway; // Store payment gateway used
        await order.save();

        // Update vendor wallets: Total Amount - Delivery Charge - Commission
        await updateVendorWalletsOnPaymentVerification(order);

        logger.info(`Payment verified for order ${order.orderNumber} via ${gateway}`);

        res.status(200).json({
          success: true,
          message: 'Payment verified successfully',
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            paymentStatus: order.payment.status,
            transactionId: order.payment.transactionId,
            paymentMethod: order.payment.method,
            paidAt: order.payment.paidAt,
          },
        });
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error) {
      logger.error('Verify payment error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Payment verification failed',
      });
    }
  }
);

/**
 * PhonePe callback endpoint (webhook)
 */
router.post(
  '/phonepay/callback',
  async (req, res, next) => {
    try {
      const { code, message, data } = req.body;

      if (code === 'PAYMENT_SUCCESS' && data) {
        const { merchantTransactionId, transactionId } = data;

        // Find order by transaction ID
        const order = await Order.findOne({
          'payment.transactionId': merchantTransactionId,
        });

        if (order && order.payment.status !== 'completed') {
          order.payment.status = 'completed';
          order.payment.transactionId = transactionId || merchantTransactionId;
          order.payment.paidAt = new Date();
          order.payment.method = 'phonepay'; // Store payment gateway used
          await order.save();

          // Update vendor wallets: Total Amount - Delivery Charge - Commission
          await updateVendorWalletsOnPaymentVerification(order);

          logger.info(`PhonePe payment callback processed for order ${order.orderNumber}`);
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('PhonePe callback error:', error);
      res.status(200).json({ success: false }); // Return 200 to prevent retries
    }
  }
);

/**
 * Cashfree Payment webhook/callback
 * POST /api/payment/cashfree/callback
 */
router.post(
  '/cashfree/callback',
  async (req, res, next) => {
    try {
      const { data } = req.body;

      if (data && data.order && data.order.order_status === 'PAID') {
        const { order_id, order_amount } = data.order;

        // Find order by transaction ID
        const order = await Order.findOne({
          'payment.transactionId': order_id,
        });

        if (order && order.payment.status !== 'completed') {
          order.payment.status = 'completed';
          order.payment.transactionId = order_id;
          order.payment.paidAt = new Date();
          order.payment.method = 'cashfree';
          await order.save();

          // Update vendor wallets: Total Amount - Delivery Charge - Commission
          await updateVendorWalletsOnPaymentVerification(order);

          logger.info(`Cashfree payment callback processed for order ${order.orderNumber}`);
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Cashfree callback error:', error);
      res.status(200).json({ success: false }); // Return 200 to prevent retries
    }
  }
);

/**
 * Razorpay Payment Link webhook/callback
 * POST /api/payment/razorpay/callback
 */
router.post(
  '/razorpay/callback',
  async (req, res, next) => {
    try {
      const { event, payload } = req.body;

      // Handle payment link payment success
      if (event === 'payment_link.paid') {
        const { payment_link, payment } = payload;

        if (payment_link && payment) {
          // Find order by payment link ID or transaction ID
          const order = await Order.findOne({
            $or: [
              { 'payment.transactionId': payment_link.id },
              { 'payment.transactionId': payment.id },
            ],
          });

          if (order && order.payment.status !== 'completed') {
            order.payment.status = 'completed';
            order.payment.transactionId = payment.id;
            order.payment.paidAt = new Date();
            order.payment.method = 'razorpay';
            await order.save();

            // Update vendor wallets: Total Amount - Delivery Charge - Commission
            await updateVendorWalletsOnPaymentVerification(order);

            logger.info(`Razorpay payment link callback processed for order ${order.orderNumber}`);
          }
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Razorpay payment link callback error:', error);
      res.status(200).json({ success: false }); // Return 200 to prevent retries
    }
  }
);

/**
 * Retry payment for an order (if payment failed or not initialized)
 */
router.post(
  '/retry/:orderId',
  protect,
  [
    param('orderId')
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
  ],
  async (req, res, next) => {
    try {
      const errors = require('express-validator').validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { orderId } = req.params;
      const userId = req.user._id;

      // Get order and verify ownership
      const order = await Order.findOne({ _id: orderId, user: userId });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      // Check if payment is already completed
      if (order.payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Payment already completed for this order',
        });
      }

      // If payment method is COD, update it to prepaid for online payment
      if (order.payment.method === 'cod') {
        order.payment.method = 'prepaid';
        await order.save();
        logger.info(`Payment method updated from COD to prepaid for order ${order.orderNumber}`);
      }

      // Get user email for payment
      const User = require('../models/User');
      const user = await User.findById(userId).select('email');

      // Prepare order data for payment
      const orderData = {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        userId: userId.toString(),
        amount: order.payment.amount,
        email: user?.email || '',
        phone: order.shippingAddress.phone,
        shippingAddress: order.shippingAddress,
        items: order.items.map(item => ({
          title: item.productName,
          quantity: item.quantity,
          price: item.salePrice || item.unitPrice,
        })),
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
      };

      // Initialize payment
      const paymentResult = await initializePayment(orderData);

      // Update order with payment gateway info
      order.payment.transactionId = paymentResult.orderId || paymentResult.merchantTransactionId || paymentResult.checkoutId;
      order.payment.status = 'processing';
      await order.save();

      logger.info(`Payment retry successful for order ${order.orderNumber} using ${paymentResult.paymentGateway}`);

      res.status(200).json({
        success: true,
        message: 'Payment retry successful',
        data: {
          ...paymentResult,
          // Frontend ke liye structured response
          frontendData: paymentResult.frontendData || {
            gateway: paymentResult.paymentGateway,
            orderId: paymentResult.orderId || paymentResult.merchantTransactionId || paymentResult.checkoutId,
            redirectUrl: paymentResult.redirectUrl,
            keyId: paymentResult.keyId,
            amount: paymentResult.amount,
          },
        },
      });
    } catch (error) {
      logger.error('Retry payment error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to retry payment',
      });
    }
  }
);

/**
 * Get enabled payment gateways
 */
router.get('/gateways', async (req, res, next) => {
  try {
    const gateways = await getAllEnabledGateways();

    res.status(200).json({
      success: true,
      count: gateways.length,
      data: gateways,
    });
  } catch (error) {
    logger.error('Get payment gateways error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get payment gateways',
    });
  }
});

/**
 * Create payment link (for Flutter/WebView)
 * Automatically selects payment gateway based on priority and availability from database
 * POST /api/payment/create-payment-link
 */
router.post(
  '/create-payment-link',
  protect,
  [
    body('amount')
      .notEmpty()
      .withMessage('Amount is required')
      .bail()
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Name must be between 1 and 200 characters'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email address'),
    body('contact')
      .optional()
      .trim()
      .matches(/^[0-9]{10,15}$/)
      .withMessage('Contact must be a valid phone number (10-15 digits)'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot be more than 500 characters'),
    body('callbackUrl')
      .optional()
      .isURL()
      .withMessage('Callback URL must be a valid URL'),
    body('gateway')
      .optional()
      .isIn(['razorpay', 'phonepay', 'cashfree'])
      .withMessage('Gateway must be razorpay, phonepay, or cashfree'),
  ],
  async (req, res, next) => {
    try {
      const errors = require('express-validator').validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const {
        amount,
        name,
        email,
        contact,
        description,
        callbackUrl,
        gateway,
        notes,
        notify,
      } = req.body;

      const userId = req.user._id;
      const userEmail = req.user.email || email;
      const userName = req.user.name || name || '';

      // Get payment gateway from database based on priority and availability
      // If gateway is specified, use that; otherwise get active gateway with highest priority
      let paymentGateway;
      if (gateway) {
        paymentGateway = await PaymentGateway.findOne({
          name: gateway.toLowerCase(),
          isEnabled: true,
        });
        if (!paymentGateway) {
          return res.status(400).json({
            success: false,
            error: `Payment gateway '${gateway}' is not enabled`,
          });
        }
      } else {
        // Get active gateway based on priority (highest priority first)
        paymentGateway = await getActivePaymentGateway();
      }

      logger.info(`Creating payment link using gateway: ${paymentGateway.name} (Priority: ${paymentGateway.priority}, TestMode: ${paymentGateway.testMode})`);

      // Merge credentials - test credentials override production credentials if testMode is enabled
      let credentials = { ...paymentGateway.credentials };
      if (paymentGateway.testMode && paymentGateway.testCredentials) {
        Object.keys(paymentGateway.testCredentials).forEach(key => {
          if (paymentGateway.testCredentials[key] && paymentGateway.testCredentials[key].trim()) {
            credentials[key] = paymentGateway.testCredentials[key];
          }
        });
      }

      // Create payment link based on gateway
      if (paymentGateway.name === 'razorpay') {
        const paymentLinkData = {
          amount: parseFloat(amount),
          currency: 'INR',
          description: description || 'Payment',
          name: userName,
          email: userEmail,
          contact: contact || req.user.contactNumber || '',
          callbackUrl: callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`,
          callbackMethod: 'get',
          notes: notes || {
            userId: userId.toString(),
            orderId: notes?.orderId || '',
          },
          notify: notify || {
            sms: true,
            email: true,
          },
        };

        const paymentLink = await createRazorpayPaymentLink(paymentLinkData, credentials);

        logger.info(`Payment link created for user ${userId} via Razorpay: ${paymentLink.paymentLinkId}`);

        // Simple response format for Flutter
        res.status(200).json({
          success: true,
          payment_url: paymentLink.payment_url,
          gateway: 'razorpay',
          amount: paymentLink.amount,
          currency: paymentLink.currency || 'INR',
        });
      } else if (paymentGateway.name === 'phonepay') {
        // PhonePe doesn't have payment links, use redirect URL approach
        const baseUrl = paymentGateway.testMode
          ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
          : 'https://api.phonepe.com/apis/hermes';

        const merchantTransactionId = `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const amountInPaise = Math.round(parseFloat(amount) * 100);

        const payload = {
          merchantId: credentials.phonepayMerchantId,
          merchantTransactionId: merchantTransactionId,
          merchantUserId: userId.toString(),
          amount: amountInPaise,
          redirectUrl: callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
          redirectMode: 'REDIRECT',
          callbackUrl: `${process.env.API_URL || 'http://localhost:3000'}/api/payment/phonepay/callback`,
          mobileNumber: contact || req.user.contactNumber || '',
          paymentInstrument: {
            type: 'PAY_PAGE',
          },
        };

        // Create X-VERIFY header
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const stringToHash = `${base64Payload}/pg/v1/pay${credentials.phonepaySaltKey}`;
        const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
        const xVerify = `${sha256Hash}###${credentials.phonepaySaltIndex || '1'}`;

        const response = await axios.post(
          `${baseUrl}/pg/v1/pay`,
          {
            request: base64Payload,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VERIFY': xVerify,
              'Accept': 'application/json',
            },
          }
        );

        if (response.data && response.data.success && response.data.data) {
          logger.info(`Payment link created for user ${userId} via PhonePe: ${merchantTransactionId}`);

          // Simple response format for Flutter
          res.status(200).json({
            success: true,
            payment_url: response.data.data.instrumentResponse.redirectInfo.url,
            gateway: 'phonepay',
            amount: amountInPaise / 100,
            currency: 'INR',
          });
        } else {
          throw new Error('PhonePe payment initialization failed');
        }
      } else if (paymentGateway.name === 'cashfree') {
        // Cashfree payment link creation
        // Validate credentials
        if (!credentials.cashfreeAppId || !credentials.cashfreeSecretKey) {
          throw new Error('Cashfree App ID and Secret Key are required. Please configure Cashfree credentials in admin panel.');
        }

        const appId = credentials.cashfreeAppId.trim();
        const secretKey = credentials.cashfreeSecretKey.trim();

        if (!appId || !secretKey) {
          throw new Error('Cashfree App ID and Secret Key cannot be empty');
        }

        const baseUrl = paymentGateway.testMode
          ? 'https://sandbox.cashfree.com/pg'
          : 'https://api.cashfree.com/pg';

        // Use newer API version (2023-08-01) which includes payment_link in response
        const apiVersion = credentials.cashfreeApiVersion || '2023-08-01';
        const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const amountInPaise = Math.round(parseFloat(amount) * 100);

        // Cashfree requires HTTPS URLs for notify_url
        // Get API URL and ensure it's HTTPS
        let apiBaseUrl = process.env.API_URL || process.env.BACKEND_URL;
        
        if (!apiBaseUrl) {
          // If API_URL is not set, use production URL
          apiBaseUrl = 'https://api.rushbaskets.com';
          logger.warn(`Cashfree notify_url: API_URL not set. Using production URL: ${apiBaseUrl}`);
        } else if (apiBaseUrl.startsWith('http://')) {
          // If API_URL is HTTP, convert to HTTPS
          if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
            // For localhost, use production URL or a tunnel service
            // You can set CASHFREE_WEBHOOK_URL environment variable for local development
            apiBaseUrl = process.env.CASHFREE_WEBHOOK_URL || 'https://api.rushbaskets.com';
            logger.warn(`Cashfree notify_url: Localhost detected. Using: ${apiBaseUrl}. For local development, set CASHFREE_WEBHOOK_URL to your ngrok/tunnel HTTPS URL.`);
          } else {
            // For other HTTP URLs, convert to HTTPS
            apiBaseUrl = apiBaseUrl.replace('http://', 'https://');
            logger.warn(`Cashfree notify_url: Converted HTTP to HTTPS: ${apiBaseUrl}`);
          }
        }
        
        // Ensure notify_url is HTTPS
        const notifyUrl = `${apiBaseUrl}/api/payment/cashfree/callback`;
        if (!notifyUrl.startsWith('https://')) {
          throw new Error('Cashfree requires HTTPS URL for notify_url. Please set API_URL environment variable to HTTPS URL (e.g., https://api.rushbaskets.com).');
        }

        const payload = {
          order_id: orderId,
          order_amount: amountInPaise,
          order_currency: 'INR',
          order_note: description || 'Payment',
          customer_details: {
            customer_id: userId.toString(),
            customer_name: userName,
            customer_email: userEmail,
            customer_phone: contact || req.user.contactNumber || '',
          },
          order_meta: {
            return_url: callbackUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
            notify_url: notifyUrl,
          },
        };

        try {
          // IMPORTANT: Use /orders endpoint (NOT /sessions)
          // Cashfree PG API: https://sandbox.cashfree.com/pg/orders or https://api.cashfree.com/pg/orders
          const response = await axios.post(
            `${baseUrl}/orders`,
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                'x-api-version': apiVersion, // Must be 2023-08-01
                'x-client-id': appId,
                'x-client-secret': secretKey,
              },
              timeout: 15000,
            }
          );

          // Log full response for debugging
          logger.info('Cashfree Orders API Response:', JSON.stringify(response.data, null, 2));

          if (!response.data || !response.data.payment_session_id) {
            logger.error('Cashfree /orders response missing payment_session_id. Full response:', JSON.stringify(response.data, null, 2));
            throw new Error(`Cashfree payment initialization failed: Invalid response from Cashfree API. Available fields: ${Object.keys(response.data || {}).join(', ')}`);
          }

          // Get payment_session_id from response
          const paymentSessionId = response.data.payment_session_id;

          // Check for payment_link in response (may or may not be present depending on API version)
          let paymentUrl = response.data.payment_link || 
                         response.data.payment_url || 
                         response.data.paymentLink ||
                         response.data.paymentUrl;

          // If payment_link is not in response, we need to construct it
          // Cashfree payment URL format: https://payments.cashfree.com/forms/pay/{payment_session_id}
          if (!paymentUrl) {
            logger.warn('Cashfree response does not contain payment_link. Constructing URL from payment_session_id.');
            // For Cashfree, payment link is constructed from payment_session_id
            // Format: https://payments.cashfree.com/forms/pay/{payment_session_id}
            paymentUrl = `https://payments.cashfree.com/forms/pay/${paymentSessionId}`;
          }
          
          logger.info(`Payment link created for user ${userId} via Cashfree: ${orderId}`);

          // Simple response format - orderId not required for standalone payment links
          res.status(200).json({
            success: true,
            payment_url: paymentUrl, // Use payment_link directly from API
            gateway: 'cashfree',
            amount: amountInPaise / 100,
            currency: 'INR',
            // order_id removed - not required for standalone payment links
            // Cashfree order_id is for internal tracking only
            payment_session_id: paymentSessionId,
          });
        } catch (apiError) {
          logger.error('Cashfree API error:', apiError.response?.data || apiError.message);
          
          if (apiError.response) {
            const status = apiError.response.status;
            const errorData = apiError.response.data;
            
            if (status === 401 || status === 403) {
              throw new Error('Invalid Cashfree credentials. Please check your App ID and Secret Key.');
            }
            
            const errorMessage = errorData?.message || 
                               errorData?.error || 
                               `Cashfree API error (${status}). Please check your credentials.`;
            throw new Error(errorMessage);
          }
          
          if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
            throw new Error('Connection timeout. Please try again.');
          }
          
          throw new Error(`Cashfree payment initialization failed: ${apiError.message}`);
        }
      } else {
        return res.status(400).json({
          success: false,
          error: `Payment gateway '${paymentGateway.name}' does not support payment links`,
        });
      }
    } catch (error) {
      logger.error('Create payment link error:', error);
      
      // Return user-friendly error message
      let errorMessage = 'Failed to create payment link';
      if (error.message) {
        if (error.message.includes('No payment gateway')) {
          errorMessage = 'No payment gateway is enabled. Please contact support.';
        } else if (error.message.includes('credentials')) {
          errorMessage = 'Payment gateway credentials are missing or invalid. Please contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

module.exports = router;
