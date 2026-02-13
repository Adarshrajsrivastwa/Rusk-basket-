const PaymentRequest = require('../models/PaymentRequest');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Rider = require('../models/Rider');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Send payment request
 */
exports.sendPaymentRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      requestedTo,
      requestedToType,
      amount,
      currency,
      description,
      paymentMethod,
      orderId,
      metadata,
    } = req.body;

    // Determine who is requesting (from authentication)
    let requestedBy, requestedByType;
    if (req.user) {
      requestedBy = req.user._id;
      requestedByType = 'User';
    } else if (req.vendor) {
      requestedBy = req.vendor._id;
      requestedByType = 'Vendor';
    } else if (req.rider) {
      requestedBy = req.rider._id;
      requestedByType = 'Rider';
    } else if (req.admin) {
      requestedBy = req.admin._id;
      requestedByType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Validate requestedTo exists
    let requestedToExists = false;
    if (requestedToType === 'User') {
      const user = await User.findById(requestedTo);
      requestedToExists = !!user;
    } else if (requestedToType === 'Vendor') {
      const vendor = await Vendor.findById(requestedTo);
      requestedToExists = !!vendor;
    } else if (requestedToType === 'Rider') {
      const rider = await Rider.findById(requestedTo);
      requestedToExists = !!rider;
    } else if (requestedToType === 'System') {
      requestedToExists = true; // System always exists
    }

    if (!requestedToExists) {
      return res.status(404).json({
        success: false,
        error: `${requestedToType} not found`,
      });
    }

    // Create payment request
    const paymentRequest = await PaymentRequest.create({
      requestedBy,
      requestedByType,
      requestedTo,
      requestedToType,
      amount: parseFloat(amount),
      currency: currency || 'INR',
      description: description || '',
      paymentMethod: paymentMethod || 'wallet',
      orderId: orderId || null,
      metadata: metadata || {},
    });

    logger.info(
      `Payment request created: ${paymentRequest._id} by ${requestedByType} ${requestedBy} to ${requestedToType} ${requestedTo} for ₹${amount}`
    );

    const populatedRequest = await PaymentRequest.findById(paymentRequest._id)
      .populate('requestedBy', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('requestedTo', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber');

    res.status(201).json({
      success: true,
      message: 'Payment request sent successfully',
      data: populatedRequest,
    });
  } catch (error) {
    logger.error('Send payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send payment request',
    });
  }
};

/**
 * Get payment requests (sent by me)
 */
exports.getMyPaymentRequests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status; // pending, approved, rejected, cancelled

    // Determine who is requesting
    let requestedBy, requestedByType;
    if (req.user) {
      requestedBy = req.user._id;
      requestedByType = 'User';
    } else if (req.vendor) {
      requestedBy = req.vendor._id;
      requestedByType = 'Vendor';
    } else if (req.rider) {
      requestedBy = req.rider._id;
      requestedByType = 'Rider';
    } else if (req.admin) {
      requestedBy = req.admin._id;
      requestedByType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Build query
    const query = {
      requestedBy,
      requestedByType,
    };

    if (status) {
      query.status = status;
    }

    // Get payment requests
    const paymentRequests = await PaymentRequest.find(query)
      .populate('requestedTo', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber')
      .populate('approvedBy', 'name email vendorName fullName userName')
      .populate('rejectedBy', 'name email vendorName fullName userName')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await PaymentRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      count: paymentRequests.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: paymentRequests,
    });
  } catch (error) {
    logger.error('Get my payment requests error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment requests',
    });
  }
};

/**
 * Get payment requests (received by me)
 */
exports.getReceivedPaymentRequests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status; // pending, approved, rejected, cancelled

    // Determine who is receiving
    let requestedTo, requestedToType;
    if (req.user) {
      requestedTo = req.user._id;
      requestedToType = 'User';
    } else if (req.vendor) {
      requestedTo = req.vendor._id;
      requestedToType = 'Vendor';
    } else if (req.rider) {
      requestedTo = req.rider._id;
      requestedToType = 'Rider';
    } else if (req.admin) {
      requestedTo = req.admin._id;
      requestedToType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Build query
    const query = {
      requestedTo,
      requestedToType,
    };

    if (status) {
      query.status = status;
    }

    // Get payment requests
    const paymentRequests = await PaymentRequest.find(query)
      .populate('requestedBy', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber')
      .populate('approvedBy', 'name email vendorName fullName userName')
      .populate('rejectedBy', 'name email vendorName fullName userName')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await PaymentRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      count: paymentRequests.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: paymentRequests,
    });
  } catch (error) {
    logger.error('Get received payment requests error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get received payment requests',
    });
  }
};

/**
 * Approve payment request
 */
exports.approvePaymentRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { requestId } = req.params;

    // Find payment request
    const paymentRequest = await PaymentRequest.findById(requestId);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        error: 'Payment request not found',
      });
    }

    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Payment request has already been ${paymentRequest.status}`,
        currentStatus: paymentRequest.status,
      });
    }

    // Determine who is approving
    let approvedBy, approvedByType;
    if (req.user) {
      approvedBy = req.user._id;
      approvedByType = 'User';
    } else if (req.vendor) {
      approvedBy = req.vendor._id;
      approvedByType = 'Vendor';
    } else if (req.rider) {
      approvedBy = req.rider._id;
      approvedByType = 'Rider';
    } else if (req.admin) {
      approvedBy = req.admin._id;
      approvedByType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify that the approver is the requestedTo
    if (
      paymentRequest.requestedTo.toString() !== approvedBy.toString() ||
      paymentRequest.requestedToType !== approvedByType
    ) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to approve this payment request',
      });
    }

    // If payment method is wallet and requestedTo is User, process wallet transfer
    if (paymentRequest.paymentMethod === 'wallet' && paymentRequest.requestedToType === 'User') {
      // Find or create wallet
      let wallet = await Wallet.findOne({ user: paymentRequest.requestedTo });
      if (!wallet) {
        wallet = await Wallet.create({ user: paymentRequest.requestedTo, balance: 0 });
      }

      // Check if wallet has sufficient balance
      if (wallet.balance < paymentRequest.amount) {
        return res.status(400).json({
          success: false,
          error: `Insufficient wallet balance. Current balance: ₹${wallet.balance.toFixed(2)}, Required: ₹${paymentRequest.amount.toFixed(2)}`,
        });
      }

      // Deduct from wallet
      wallet.balance -= paymentRequest.amount;
      wallet.transactions.push({
        type: 'debit',
        amount: paymentRequest.amount,
        description: paymentRequest.description || `Payment request approved to ${paymentRequest.requestedByType}`,
        orderId: paymentRequest.orderId || null,
      });
      await wallet.save();

      // Add to requestedBy wallet if User
      if (paymentRequest.requestedByType === 'User') {
        let requestedByWallet = await Wallet.findOne({ user: paymentRequest.requestedBy });
        if (!requestedByWallet) {
          requestedByWallet = await Wallet.create({ user: paymentRequest.requestedBy, balance: 0 });
        }
        requestedByWallet.balance += paymentRequest.amount;
        requestedByWallet.transactions.push({
          type: 'credit',
          amount: paymentRequest.amount,
          description: paymentRequest.description || 'Payment request approved',
          orderId: paymentRequest.orderId || null,
        });
        await requestedByWallet.save();
      }
    }

    // Update payment request
    paymentRequest.status = 'approved';
    paymentRequest.approvedBy = approvedBy;
    paymentRequest.approvedByType = approvedByType;
    paymentRequest.approvedAt = new Date();
    paymentRequest.transactionId = paymentRequest._id.toString();
    await paymentRequest.save();

    logger.info(
      `Payment request ${requestId} approved by ${approvedByType} ${approvedBy} for ₹${paymentRequest.amount}`
    );

    const populatedRequest = await PaymentRequest.findById(paymentRequest._id)
      .populate('requestedBy', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('requestedTo', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber')
      .populate('approvedBy', 'name email vendorName fullName userName');

    res.status(200).json({
      success: true,
      message: 'Payment request approved successfully',
      data: populatedRequest,
    });
  } catch (error) {
    logger.error('Approve payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve payment request',
    });
  }
};

/**
 * Reject payment request
 */
exports.rejectPaymentRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    // Find payment request
    const paymentRequest = await PaymentRequest.findById(requestId);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        error: 'Payment request not found',
      });
    }

    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Payment request has already been ${paymentRequest.status}`,
        currentStatus: paymentRequest.status,
      });
    }

    // Determine who is rejecting
    let rejectedBy, rejectedByType;
    if (req.user) {
      rejectedBy = req.user._id;
      rejectedByType = 'User';
    } else if (req.vendor) {
      rejectedBy = req.vendor._id;
      rejectedByType = 'Vendor';
    } else if (req.rider) {
      rejectedBy = req.rider._id;
      rejectedByType = 'Rider';
    } else if (req.admin) {
      rejectedBy = req.admin._id;
      rejectedByType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify that the rejector is the requestedTo
    if (
      paymentRequest.requestedTo.toString() !== rejectedBy.toString() ||
      paymentRequest.requestedToType !== rejectedByType
    ) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to reject this payment request',
      });
    }

    // Update payment request
    paymentRequest.status = 'rejected';
    paymentRequest.rejectedBy = rejectedBy;
    paymentRequest.rejectedByType = rejectedByType;
    paymentRequest.rejectedAt = new Date();
    if (rejectionReason) {
      paymentRequest.rejectionReason = rejectionReason;
    }
    await paymentRequest.save();

    logger.info(
      `Payment request ${requestId} rejected by ${rejectedByType} ${rejectedBy}`
    );

    const populatedRequest = await PaymentRequest.findById(paymentRequest._id)
      .populate('requestedBy', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('requestedTo', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber')
      .populate('rejectedBy', 'name email vendorName fullName userName');

    res.status(200).json({
      success: true,
      message: 'Payment request rejected successfully',
      data: populatedRequest,
    });
  } catch (error) {
    logger.error('Reject payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reject payment request',
    });
  }
};

/**
 * Cancel payment request (by requester)
 */
exports.cancelPaymentRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    // Find payment request
    const paymentRequest = await PaymentRequest.findById(requestId);

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        error: 'Payment request not found',
      });
    }

    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel payment request. Current status: ${paymentRequest.status}`,
      });
    }

    // Determine who is cancelling
    let requestedBy, requestedByType;
    if (req.user) {
      requestedBy = req.user._id;
      requestedByType = 'User';
    } else if (req.vendor) {
      requestedBy = req.vendor._id;
      requestedByType = 'Vendor';
    } else if (req.rider) {
      requestedBy = req.rider._id;
      requestedByType = 'Rider';
    } else if (req.admin) {
      requestedBy = req.admin._id;
      requestedByType = 'Admin';
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Verify that the canceller is the requestedBy
    if (
      paymentRequest.requestedBy.toString() !== requestedBy.toString() ||
      paymentRequest.requestedByType !== requestedByType
    ) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to cancel this payment request',
      });
    }

    // Update payment request
    paymentRequest.status = 'cancelled';
    paymentRequest.cancelledAt = new Date();
    await paymentRequest.save();

    logger.info(
      `Payment request ${requestId} cancelled by ${requestedByType} ${requestedBy}`
    );

    res.status(200).json({
      success: true,
      message: 'Payment request cancelled successfully',
      data: paymentRequest,
    });
  } catch (error) {
    logger.error('Cancel payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel payment request',
    });
  }
};

/**
 * Get single payment request
 */
exports.getPaymentRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const paymentRequest = await PaymentRequest.findById(requestId)
      .populate('requestedBy', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('requestedTo', 'userName email contactNumber vendorName storeName fullName mobileNumber name email')
      .populate('orderId', 'orderNumber')
      .populate('approvedBy', 'name email vendorName fullName userName')
      .populate('rejectedBy', 'name email vendorName fullName userName');

    if (!paymentRequest) {
      return res.status(404).json({
        success: false,
        error: 'Payment request not found',
      });
    }

    res.status(200).json({
      success: true,
      data: paymentRequest,
    });
  } catch (error) {
    logger.error('Get payment request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment request',
    });
  }
};
