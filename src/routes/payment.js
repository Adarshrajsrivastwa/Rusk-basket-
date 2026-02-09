const express = require('express');
const { body, param, query } = require('express-validator');
const {
  initializePayment,
  verifyPayment,
  getActivePaymentGateway,
  getAllEnabledGateways,
} = require('../services/paymentService');
const { protect } = require('../middleware/userAuth');
const logger = require('../utils/logger');
const Order = require('../models/Order');

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
        data: paymentResult,
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
        order.payment.transactionId = verificationResult.paymentId || verificationResult.orderId;
        order.payment.paidAt = new Date();
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

module.exports = router;
