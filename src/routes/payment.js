const express = require('express');
const { body, param, query } = require('express-validator');
const crypto = require('crypto');
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
      .notEmpty()
      .withMessage('Order ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid order ID'),
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
      .isIn(['razorpay', 'phonepay', 'shopify'])
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

      // Verify payment
      const verificationResult = await verifyPayment(paymentData, gateway);

      if (verificationResult.success) {
        // Update order payment status
        order.payment.status = 'completed';
        order.payment.transactionId = verificationResult.paymentId || verificationResult.orderId || verificationResult.merchantTransactionId;
        order.payment.paidAt = new Date();
        order.payment.method = gateway; // Store payment gateway used
        await order.save();

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
      .isIn(['razorpay', 'phonepay'])
      .withMessage('Gateway must be razorpay or phonepay'),
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

      // Get payment gateway (prefer specified gateway, otherwise get active)
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
        paymentGateway = await getActivePaymentGateway();
      }

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

        res.status(200).json({
          success: true,
          payment_url: paymentLink.payment_url,
          paymentLinkId: paymentLink.paymentLinkId,
          amount: paymentLink.amount,
          currency: paymentLink.currency,
          status: paymentLink.status,
          gateway: 'razorpay',
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

        const axios = require('axios');
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

          res.status(200).json({
            success: true,
            payment_url: response.data.data.instrumentResponse.redirectInfo.url,
            merchantTransactionId: merchantTransactionId,
            amount: amountInPaise / 100,
            currency: 'INR',
            gateway: 'phonepay',
          });
        } else {
          throw new Error('PhonePe payment initialization failed');
        }
      } else {
        return res.status(400).json({
          success: false,
          error: `Payment gateway '${paymentGateway.name}' does not support payment links`,
        });
      }
    } catch (error) {
      logger.error('Create payment link error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create payment link',
      });
    }
  }
);

module.exports = router;
