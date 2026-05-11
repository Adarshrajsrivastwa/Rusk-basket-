const Rider = require('../models/Rider');
const Order = require('../models/Order');
const RiderJobApplication = require('../models/RiderJobApplication');
const RiderJobPost = require('../models/RiderJobPost');
const RiderEarningWalletWithdrawal = require('../models/RiderEarningWalletWithdrawal');
const RiderDueAmountRequest = require('../models/RiderDueAmountRequest');
const Vendor = require('../models/Vendor');
const { notificationQueue } = require('../utils/queue');
const { notifyRiderOrderUpdate } = require('../utils/socket');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateRiderProfileData } = require('../services/riderService');
const { normalizeJobApplied } = require('../utils/riderJobApplied');
const { uploadToCloudinary } = require('../utils/cloudinary');
const mongoose = require('mongoose');

/**
 * Check if rider has an active order (not delivered, cancelled, or refunded)
 */
const hasActiveOrder = async (riderId) => {
  const activeOrder = await Order.findOne({
    rider: riderId,
    status: {
      $nin: ['delivered', 'cancelled', 'refunded']
    },
  });
  return !!activeOrder;
};

exports.getProfile = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.rider._id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    const payload = rider.toObject();
    payload.jobApplied = normalizeJobApplied(rider.jobApplied);

    res.status(200).json({
      success: true,
      job: Boolean(rider.vendor),
      kyc: Boolean(rider.kyc),
      jobApplied: payload.jobApplied,
      data: payload,
    });
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const rider = await Rider.findById(req.rider._id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!rider.mobileNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Please verify your mobile number first',
      });
    }

    // If profile is being updated and approval status is pending, keep it pending
    // If already approved/rejected, don't change approval status
    const previousApprovalStatus = rider.approvalStatus;

    await updateRiderProfileData(rider, req.body, req.files);

    // If updating profile, set status to pending for re-approval
    if (previousApprovalStatus === 'approved' || previousApprovalStatus === 'rejected') {
      rider.approvalStatus = 'pending';
      rider.approvedBy = undefined;
      rider.approvedAt = undefined;
      rider.rejectionReason = undefined;
    }

    await rider.save();

    logger.info(`Rider profile updated: ${rider.mobileNumber} (ID: ${rider._id})`);

    const payload = rider.toObject();
    payload.jobApplied = normalizeJobApplied(rider.jobApplied);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully. Status set to pending for approval.',
      job: Boolean(rider.vendor),
      kyc: Boolean(rider.kyc),
      jobApplied: payload.jobApplied,
      data: payload,
    });
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes('language format') || error.message.includes('work details format')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

// Admin functions
exports.getRiders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    const riders = await Rider.find(query)
      .populate('approvedBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Rider.countDocuments(query);

    res.status(200).json({
      success: true,
      count: riders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: riders,
    });
  } catch (error) {
    logger.error('Get riders error:', error);
    next(error);
  }
};

exports.getRider = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.params.id).populate('approvedBy', 'name email');

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error('Get rider error:', error);
    next(error);
  }
};

exports.approveRider = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    const action = req.originalUrl.includes('/approve') ? 'approve' : 'reject';

    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (action === 'approve') {
      rider.approvalStatus = 'approved';
      rider.approvedBy = req.admin._id;
      rider.approvedAt = new Date();
      rider.rejectionReason = undefined;
    } else {
      rider.approvalStatus = 'rejected';
      rider.rejectionReason = rejectionReason || 'Rider rejected by super admin';
      rider.approvedBy = undefined;
      rider.approvedAt = undefined;
    }

    await rider.save();

    const populatedRider = await Rider.findById(rider._id).populate('approvedBy', 'name email');

    logger.info(`Rider ${action}d: ${rider.fullName || rider.mobileNumber} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `Rider ${action}d successfully`,
      data: populatedRider,
    });
  } catch (error) {
    logger.error('Approve/reject rider error:', error);
    next(error);
  }
};

exports.suspendRider = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    rider.isActive = !rider.isActive;
    await rider.save();

    const action = rider.isActive ? 'activated' : 'suspended';
    logger.info(`Rider ${action}: ${rider.mobileNumber} (ID: ${rider._id}) by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: `Rider ${action} successfully`,
      data: rider,
    });
  } catch (error) {
    logger.error('Suspend rider error:', error);
    next(error);
  }
};

exports.getPendingRiders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      approvalStatus: 'pending',
    };

    const riders = await Rider.find(query)
      .populate('approvedBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Rider.countDocuments(query);

    logger.info(`Pending riders retrieved: ${total} total, ${riders.length} in page ${page}`);

    res.status(200).json({
      success: true,
      count: riders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: riders,
    });
  } catch (error) {
    logger.error('Get pending riders error:', error);
    next(error);
  }
};

/**
 * Get available orders for rider (orders that need assignment)
 */
exports.getAvailableOrders = async (req, res, next) => {
  try {
    const riderId = req.rider._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if rider has an active order - if yes, don't show available orders
    const hasActive = await hasActiveOrder(riderId);
    if (hasActive) {
      return res.status(200).json({
        success: true,
        count: 0,
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        data: [],
        message: 'You have an active order. Please complete your current delivery before accepting new orders.',
      });
    }

    // Get vendor this rider works for (from Rider model)
    const rider = await Rider.findById(riderId);
    if (!rider || !rider.vendor) {
      return res.status(200).json({
        success: true,
        count: 0,
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        data: [],
        message: 'No vendor assigned. You need to be approved by a vendor to receive orders.',
      });
    }

    const vendorIds = [rider.vendor.toString()];

    // Find orders that are ready and have assignment requests for this rider
    const orders = await Order.find({
      status: 'ready',
      'items.vendor': { $in: vendorIds },
      $or: [
        { rider: null }, // No rider assigned yet
        { 'assignmentRequestSentTo.rider': riderId, 'assignmentRequestSentTo.status': 'pending' },
      ],
    })
      .populate('user', 'userName contactNumber')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName storeAddress')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Filter orders to only show those where this rider has a pending request or no rider is assigned
    const availableOrders = orders.filter(order => {
      // If rider is already assigned, skip
      if (order.rider) {
        return false;
      }

      // Check if this rider has a pending assignment request
      const riderRequest = order.assignmentRequestSentTo?.find(
        req => req.rider?.toString() === riderId.toString() && req.status === 'pending'
      );

      return !order.rider || riderRequest;
    });

    const total = await Order.countDocuments({
      status: 'ready',
      'items.vendor': { $in: vendorIds },
      rider: null,
    });

    res.status(200).json({
      success: true,
      count: availableOrders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: availableOrders,
    });
  } catch (error) {
    logger.error('Get available orders error:', error);
    next(error);
  }
};

/**
 * Accept order assignment
 */
exports.acceptOrderAssignment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { orderId } = req.params;

    // Check if rider has an active order - if yes, don't allow accepting new orders
    const hasActive = await hasActiveOrder(riderId);
    if (hasActive) {
      return res.status(400).json({
        success: false,
        error: 'You have an active order. Please complete your current delivery before accepting new orders.',
      });
    }

    // Find the order for initial validation
    const initialOrder = await Order.findById(orderId);

    if (!initialOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Check if order is in ready status
    if (initialOrder.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Order is not available for assignment. Current status: ${initialOrder.status}`,
      });
    }

    // Check if rider is already assigned
    if (initialOrder.rider) {
      return res.status(400).json({
        success: false,
        error: 'This order has already been assigned to another rider',
      });
    }

    // Verify rider works for the vendor
    const rider = await Rider.findById(riderId);
    if (!rider || !rider.vendor) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned to any vendor. Please get approved by a vendor first.',
      });
    }

    const vendorIds = [...new Set(initialOrder.items.map(item => {
      const vendorId = item.vendor?._id || item.vendor;
      return vendorId?.toString();
    }).filter(Boolean))];

    const riderVendorId = rider.vendor.toString();
    const hasAccess = vendorIds.includes(riderVendorId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned to any vendor for this order. You can only accept orders from your assigned vendor.',
      });
    }

    // Check if rider has a pending assignment request
    const riderRequest = initialOrder.assignmentRequestSentTo?.find(
      req => req.rider?.toString() === riderId.toString()
    );

    if (!riderRequest && initialOrder.assignmentRequestSentTo?.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'You were not notified about this order',
      });
    }

    // Use atomic update to prevent race condition when multiple riders accept simultaneously
    // Only update if rider is still null (not assigned yet) - CRITICAL for preventing double assignment
    const updateResult = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: 'ready',
        rider: null, // CRITICAL: Only update if no rider assigned yet (atomic check)
      },
      {
        $set: {
          rider: riderId,
          assignedAt: new Date(),
          status: 'rider_assign',
          'assignmentRequestSentTo.$[acceptedElem].status': 'accepted',
          'assignmentRequestSentTo.$[acceptedElem].respondedAt': new Date(),
          'assignmentRequestSentTo.$[expiredElem].status': 'expired',
          'assignmentRequestSentTo.$[expiredElem].respondedAt': new Date(),
        }
      },
      {
        arrayFilters: [
          { 'acceptedElem.rider': riderId }, // This rider's request
          { 'expiredElem.rider': { $ne: riderId }, 'expiredElem.status': 'pending' } // Other pending requests
        ],
        new: true, // Return updated document
        runValidators: true,
      }
    );

    // If updateResult is null, another rider already accepted (race condition handled)
    if (!updateResult) {
      // Re-fetch to get current state
      const currentOrder = await Order.findById(orderId).populate('rider', 'fullName mobileNumber');
      if (currentOrder && currentOrder.rider) {
        return res.status(400).json({
          success: false,
          error: 'This order has already been assigned to another rider. Another rider accepted it just before you.',
          assignedRider: {
            name: currentOrder.rider.fullName,
            mobile: currentOrder.rider.mobileNumber
          }
        });
      }
      if (currentOrder && currentOrder.status !== 'ready') {
        return res.status(400).json({
          success: false,
          error: `Order is no longer available for assignment. Current status: ${currentOrder.status}`,
        });
      }
      // If still available but update failed, return conflict error
      return res.status(409).json({
        success: false,
        error: 'Order assignment conflict. Please try again.',
      });
    }

    // Use the updated order from atomic operation
    const order = updateResult;

    // Notify user about rider assignment
    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName storeAddress contactNumber')
      .populate('rider', 'fullName mobileNumber');

    if (notificationQueue && populatedOrder.user) {
      // Get vendor details from order items (first vendor)
      const firstVendor = populatedOrder.items?.[0]?.vendor;
      const vendorName = firstVendor?.vendorName || firstVendor?.storeName || 'Vendor';
      const vendorContact = firstVendor?.contactNumber || '';
      const storeAddress = firstVendor?.storeAddress ? [
        firstVendor.storeAddress.line1,
        firstVendor.storeAddress.line2,
        firstVendor.storeAddress.city,
        firstVendor.storeAddress.state,
        firstVendor.storeAddress.pinCode
      ].filter(Boolean).join(', ') : '';

      await notificationQueue.add({
        userId: populatedOrder.user._id,
        type: 'rider_assigned',
        title: 'Rider Assigned to Your Order',
        message: `Rider ${populatedOrder.rider?.fullName || populatedOrder.rider?.mobileNumber} has been assigned to your order ${order.orderNumber}`,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          rider: {
            name: populatedOrder.rider?.fullName,
            mobileNumber: populatedOrder.rider?.mobileNumber,
          },
          vendor: {
            name: vendorName,
            storeAddress: storeAddress,
            contactNumber: vendorContact,
          },
          type: 'user',
        },
      });
    }

    // Notify rider via WebSocket about the assignment with amount and location
    try {
      const orderUpdateData = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'rider_assign',
        amount: order.pricing?.total || 0,
        deliveryAmount: order.deliveryAmount || 0,
        pricing: order.pricing,
        shippingAddress: order.shippingAddress,
        location: {
          address: [
            order.shippingAddress?.line1,
            order.shippingAddress?.line2,
            order.shippingAddress?.city,
            order.shippingAddress?.state,
            order.shippingAddress?.pinCode
          ].filter(Boolean).join(', '),
          city: order.shippingAddress?.city || '',
          state: order.shippingAddress?.state || '',
          pinCode: order.shippingAddress?.pinCode || '',
          coordinates: {
            latitude: order.shippingAddress?.latitude || null,
            longitude: order.shippingAddress?.longitude || null,
          }
        },
        rider: populatedOrder.rider,
      };

      notifyRiderOrderUpdate(riderId, orderUpdateData);
    } catch (socketError) {
      logger.error(`Error sending WebSocket notification to rider: ${socketError.message}`);
    }

    logger.info(`Rider ${riderId} accepted assignment for order ${order.orderNumber}`);

    res.status(200).json({
      success: true,
      message: 'Order assignment accepted successfully',
      data: populatedOrder,
    });
  } catch (error) {
    logger.error('Accept order assignment error:', error);
    next(error);
  }
};

/**
 * Get rider's assigned orders
 */
exports.getMyOrders = async (req, res, next) => {
  try {
    const riderId = req.rider._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || null;

    let query = { rider: riderId };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('user', 'userName contactNumber')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName storeAddress')
      .sort({ assignedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      count: orders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: orders,
    });
  } catch (error) {
    logger.error('Get my orders error:', error);
    next(error);
  }
};

/**
 * Reject order assignment
 */
exports.rejectOrderAssignment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { orderId } = req.params;
    const { reason } = req.body; // Optional rejection reason

    // Find the order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Check if order is in ready status
    if (order.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Order is not available for assignment. Current status: ${order.status}`,
      });
    }

    // Check if rider is already assigned
    if (order.rider) {
      return res.status(400).json({
        success: false,
        error: 'This order has already been assigned to another rider',
      });
    }

    // Check if rider has a pending assignment request
    const riderRequest = order.assignmentRequestSentTo?.find(
      req => req.rider?.toString() === riderId.toString() && req.status === 'pending'
    );

    if (!riderRequest) {
      return res.status(403).json({
        success: false,
        error: 'You do not have a pending assignment request for this order',
      });
    }

    // Update assignment request status to rejected
    riderRequest.status = 'rejected';
    riderRequest.respondedAt = new Date();
    if (reason) {
      riderRequest.rejectionReason = reason;
    }

    await order.save();

    logger.info(`Rider ${riderId} rejected assignment for order ${order.orderNumber}`);

    res.status(200).json({
      success: true,
      message: 'Order assignment rejected successfully',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'rejected',
      },
    });
  } catch (error) {
    logger.error('Reject order assignment error:', error);
    next(error);
  }
};

/**
 * Get delivered orders by rider ID
 * Returns all orders that have been delivered by the specified rider
 */
exports.getDeliveredOrders = async (req, res, next) => {
  try {
    const riderId = req.params.riderId || req.rider?._id;

    if (!riderId) {
      return res.status(400).json({
        success: false,
        error: 'Rider ID is required',
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find all delivered orders for this rider
    const query = {
      rider: riderId,
      status: 'delivered',
    };

    const orders = await Order.find(query)
      .populate('user', 'userName contactNumber')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName storeAddress')
      .sort({ deliveredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      count: orders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: orders,
    });
  } catch (error) {
    logger.error('Get delivered orders error:', error);
    next(error);
  }
};

/**
 * Get current/active order for a rider
 * Returns any order that is currently assigned to the rider and not yet delivered/cancelled
 */
exports.getCurrentOrder = async (req, res, next) => {
  try {
    const riderId = req.params.riderId || req.rider?._id;

    if (!riderId) {
      return res.status(400).json({
        success: false,
        error: 'Rider ID is required',
      });
    }

    // Find any active order for this rider (not delivered, cancelled, or refunded)
    const query = {
      rider: riderId,
      status: {
        $nin: ['delivered', 'cancelled', 'refunded']
      },
    };

    const order = await Order.findOne(query)
      .populate('user', 'userName contactNumber')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName storeAddress')
      .sort({ assignedAt: -1, createdAt: -1 })
      .lean();

    if (!order) {
      return res.status(200).json({
        success: true,
        message: 'No current order found',
        data: null,
        hasCurrentOrder: false,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Current order found',
      data: order,
      hasCurrentOrder: true,
    });
  } catch (error) {
    logger.error('Get current order error:', error);
    next(error);
  }
};

/**
 * Mark order as delivered by rider
 * Rider can only mark orders assigned to them as delivered
 */
exports.markOrderDelivered = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { orderId } = req.params;

    // Find the order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Verify order is assigned to this rider
    if (!order.rider || order.rider.toString() !== riderId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'This order is not assigned to you. You can only mark your own orders as delivered.',
      });
    }

    // Check if order is in rider_assign or out_for_delivery status
    if (order.status !== 'rider_assign' && order.status !== 'out_for_delivery') {
      return res.status(400).json({
        success: false,
        error: `Order cannot be marked as delivered. Current status: ${order.status}. Order must be in 'rider_assign' or 'out_for_delivery' status.`,
      });
    }

    // Update order status to delivered
    const previousStatus = order.status;
    order.status = 'delivered';
    order.deliveredAt = new Date();
    // Note: Wallet update now happens on payment verification, not on delivery status

    // If COD payment, add amount to user wallet
    if (order.payment.method === 'cod' && order.payment.status !== 'completed') {
      try {
        const Wallet = require('../models/Wallet');

        // Find or create wallet for user
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user, balance: 0 });
        }

        // Add COD payment amount to wallet
        const codAmount = order.payment.amount;
        wallet.balance += codAmount;

        // Add transaction record
        wallet.transactions.push({
          type: 'credit',
          amount: codAmount,
          orderId: order._id,
          orderNumber: order.orderNumber,
          description: `COD payment received for order ${order.orderNumber} (delivered by rider)`,
        });

        await wallet.save();

        // Update order payment status
        order.payment.status = 'completed';
        order.payment.paidAt = new Date();

        logger.info(`COD payment added to wallet for user ${order.user}, order ${order.orderNumber}, amount: ${codAmount} (delivered by rider ${riderId})`);
      } catch (walletError) {
        logger.error('Error adding COD payment to wallet:', walletError);
        // Don't fail order status update if wallet update fails
      }
    }

    await order.save();

    // Populate order details for response
    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber');

    // Notify all vendors in the order about delivery
    try {
      const { sendVendorPushNotification } = require('../utils/firebaseNotification');
      const vendorIds = new Set();

      // Get all unique vendor IDs from order items
      populatedOrder.items.forEach(item => {
        const itemVendorId = item.vendor?._id || item.vendor;
        if (itemVendorId) {
          vendorIds.add(itemVendorId.toString());
        }
      });

      // Notify each vendor
      for (const vendorId of vendorIds) {
        try {
          await sendVendorPushNotification(vendorId, {
            type: 'order_delivered',
            title: 'Order Delivered',
            message: `Order #${order.orderNumber} has been delivered successfully by rider`,
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: 'delivered',
            data: {
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              status: 'delivered',
              deliveredAt: order.deliveredAt,
              rider: populatedOrder.rider ? {
                _id: populatedOrder.rider._id,
                fullName: populatedOrder.rider.fullName,
                mobileNumber: populatedOrder.rider.mobileNumber,
              } : null,
            },
          });
        } catch (vendorNotifyError) {
          logger.error(`Error sending notification to vendor ${vendorId}:`, vendorNotifyError);
        }
      }
    } catch (notifyError) {
      // Don't fail the request if socket notification fails
      logger.error('Error sending socket notifications for order delivery:', notifyError);
    }

    // Send push notification to user about delivery
    if (populatedOrder.user) {
      try {
        const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
        await sendOrderStatusNotification(populatedOrder.user._id, {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'delivered',
        });
      } catch (pushError) {
        logger.error('Error sending push notification for order delivery:', pushError);
        // Don't fail the request if push notification fails
      }
    }

    // Notify user about delivery (queue for other notification types)
    if (notificationQueue && populatedOrder.user) {
      await notificationQueue.add({
        userId: populatedOrder.user._id,
        type: 'order_delivered',
        title: 'Order Delivered',
        message: `Your order ${order.orderNumber} has been delivered successfully`,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          type: 'user',
        },
      });
    }

    // Notify rider via WebSocket about the delivery completion
    try {
      const { notifyRiderOrderUpdate } = require('../utils/socket');
      const orderUpdateData = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'delivered',
        amount: order.pricing?.total || 0,
        deliveryAmount: order.deliveryAmount || 0,
        deliveredAt: order.deliveredAt,
      };

      notifyRiderOrderUpdate(riderId, orderUpdateData);
    } catch (socketError) {
      logger.error(`Error sending WebSocket notification to rider: ${socketError.message}`);
    }

    logger.info(`Rider ${riderId} marked order ${order.orderNumber} as delivered`);

    res.status(200).json({
      success: true,
      message: 'Order marked as delivered successfully',
      data: populatedOrder,
    });
  } catch (error) {
    logger.error('Mark order delivered error:', error);
    next(error);
  }
};

/**
 * Upload delivery image and update order status to out_for_delivery
 * This is called when rider uploads an image from vendor side
 */
exports.uploadDeliveryImage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { orderId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    // Check if image file is provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Delivery image is required. Please upload an image file.',
      });
    }

    // Find the order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Verify order is assigned to this rider
    if (!order.rider || order.rider.toString() !== riderId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'This order is not assigned to you. You can only upload images for your own orders.',
      });
    }

    // Check if body has out_for_delivery flag and order is already out_for_delivery
    const markAsDelivered = req.body.out_for_delivery === 'true' || req.body.out_for_delivery === true ||
      (order.status === 'out_for_delivery' && (req.body.out_for_delivery === 'true' || req.body.out_for_delivery === true));

    // Check if order is in a valid status to upload delivery image
    const validStatuses = ['rider_assign', 'ready', 'processing', 'confirmed', 'out_for_delivery'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Order cannot be updated. Current status: ${order.status}. Order must be in one of these statuses: ${validStatuses.join(', ')}.`,
      });
    }

    // Upload image to Cloudinary
    let imageResult;
    try {
      imageResult = await uploadToCloudinary(req.file, 'rush-basket/delivery-images');
    } catch (uploadError) {
      logger.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload image to Cloudinary',
        message: uploadError.message,
      });
    }

    // Delete old delivery image from Cloudinary if exists
    if (order.deliveryImage && order.deliveryImage.publicId) {
      try {
        const { deleteFromCloudinary } = require('../utils/cloudinary');
        await deleteFromCloudinary(order.deliveryImage.publicId);
      } catch (deleteError) {
        logger.error('Error deleting old delivery image:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Update order with delivery image
    order.deliveryImage = {
      url: imageResult.url,
      publicId: imageResult.publicId,
    };

    // If order is already out_for_delivery and flag is set, mark as delivered directly
    if (markAsDelivered && order.status === 'out_for_delivery') {
      order.status = 'delivered';
      order.deliveredAt = new Date();

      // If COD payment, add amount to user wallet
      if (order.payment.method === 'cod' && order.payment.status !== 'completed') {
        try {
          const Wallet = require('../models/Wallet');

          // Find or create wallet for user
          let wallet = await Wallet.findOne({ user: order.user });
          if (!wallet) {
            wallet = await Wallet.create({ user: order.user, balance: 0 });
          }

          // Add COD payment amount to wallet
          const codAmount = order.payment.amount;
          wallet.balance += codAmount;

          // Add transaction record
          wallet.transactions.push({
            type: 'credit',
            amount: codAmount,
            orderId: order._id,
            orderNumber: order.orderNumber,
            description: `COD payment received for order ${order.orderNumber} (delivered by rider)`,
          });

          await wallet.save();

          // Update order payment status
          order.payment.status = 'completed';
          order.payment.paidAt = new Date();

          logger.info(`COD payment added to wallet for user ${order.user}, order ${order.orderNumber}, amount: ${codAmount} (delivered by rider ${riderId})`);
        } catch (walletError) {
          logger.error('Error adding COD payment to wallet:', walletError);
          // Don't fail order status update if wallet update fails
        }
      }
    } else {
      // Normal flow: update status to out_for_delivery
      order.status = 'out_for_delivery';
      // Note: Wallet update now happens on payment verification, not on status change
    }

    await order.save();

    // Populate order details for response
    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber');

    // Check if order was marked as delivered
    const isDelivered = order.status === 'delivered';

    if (isDelivered) {
      logger.info(`Delivery image uploaded and order marked as delivered for order ${order.orderNumber} by rider ${riderId}`);

      // Notify all vendors in the order about delivery
      try {
        const { sendVendorPushNotification } = require('../utils/firebaseNotification');
        const vendorIds = new Set();

        // Get all unique vendor IDs from order items
        populatedOrder.items.forEach(item => {
          const itemVendorId = item.vendor?._id || item.vendor;
          if (itemVendorId) {
            vendorIds.add(itemVendorId.toString());
          }
        });

        // Notify each vendor
        for (const vendorId of vendorIds) {
          try {
            await sendVendorPushNotification(vendorId, {
              type: 'order_delivered',
              title: 'Order Delivered',
              message: `Order #${order.orderNumber} has been delivered successfully by rider`,
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              status: 'delivered',
              data: {
                orderId: order._id.toString(),
                orderNumber: order.orderNumber,
                status: 'delivered',
                deliveredAt: order.deliveredAt,
                rider: populatedOrder.rider ? {
                  _id: populatedOrder.rider._id,
                  fullName: populatedOrder.rider.fullName,
                  mobileNumber: populatedOrder.rider.mobileNumber,
                } : null,
              },
            });
          } catch (vendorNotifyError) {
            logger.error(`Error sending notification to vendor ${vendorId}:`, vendorNotifyError);
          }
        }
      } catch (notifyError) {
        logger.error('Error sending socket notifications for order delivery:', notifyError);
      }

      // Send push notification to user about delivery
      if (populatedOrder.user) {
        try {
          const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
          await sendOrderStatusNotification(populatedOrder.user._id, {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: 'delivered',
          });
        } catch (pushError) {
          logger.error('Error sending push notification for order delivery:', pushError);
        }
      }

      // Notify user about delivery (queue for other notification types)
      if (notificationQueue && populatedOrder.user) {
        await notificationQueue.add({
          userId: populatedOrder.user._id,
          type: 'order_delivered',
          title: 'Order Delivered',
          message: `Your order ${order.orderNumber} has been delivered successfully`,
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            type: 'user',
          },
        });
      }

      // Notify rider via WebSocket about the delivery completion
      try {
        const { notifyRiderOrderUpdate } = require('../utils/socket');
        const orderUpdateData = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'delivered',
          amount: order.pricing?.total || 0,
          deliveryAmount: order.deliveryAmount || 0,
          deliveredAt: order.deliveredAt,
        };

        notifyRiderOrderUpdate(riderId, orderUpdateData);
      } catch (socketError) {
        logger.error(`Error sending WebSocket notification to rider: ${socketError.message}`);
      }

      res.status(200).json({
        success: true,
        message: 'Delivery image uploaded successfully and order marked as delivered',
        data: {
          order: populatedOrder,
          deliveryImage: {
            url: imageResult.url,
            publicId: imageResult.publicId,
          },
        },
      });
    } else {
      logger.info(`Delivery image uploaded and order status updated to out_for_delivery for order ${order.orderNumber} by rider ${riderId}`);

      // Notify vendors about the status update
      try {
        const { sendVendorPushNotification } = require('../utils/firebaseNotification');
        const vendorIds = new Set();

        // Get all unique vendor IDs from order items
        populatedOrder.items.forEach(item => {
          if (item.vendor && item.vendor._id) {
            vendorIds.add(item.vendor._id.toString());
          }
        });

        // Send notification to each vendor
        for (const vendorId of vendorIds) {
          try {
            await sendVendorPushNotification(vendorId, {
              title: 'Order Out for Delivery',
              body: `Order ${order.orderNumber} is now out for delivery. Delivery image uploaded by rider.`,
              data: {
                type: 'order_status_update',
                orderId: order._id.toString(),
                orderNumber: order.orderNumber,
                status: 'out_for_delivery',
              },
            });
          } catch (notifError) {
            logger.error(`Failed to send notification to vendor ${vendorId}:`, notifError);
          }
        }
      } catch (notifError) {
        logger.error('Error sending vendor notifications:', notifError);
        // Don't fail the request if notification fails
      }

      // Notify user about the status update
      try {
        const { sendUserPushNotification } = require('../utils/firebaseNotification');
        await sendUserPushNotification(order.user._id.toString(), {
          title: 'Order Out for Delivery',
          body: `Your order ${order.orderNumber} is now out for delivery!`,
          data: {
            type: 'order_status_update',
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: 'out_for_delivery',
          },
        });
      } catch (userNotifError) {
        logger.error('Error sending user notification:', userNotifError);
        // Don't fail the request if notification fails
      }

      res.status(200).json({
        success: true,
        message: 'Delivery image uploaded successfully and order status updated to out_for_delivery',
        data: {
          order: populatedOrder,
          deliveryImage: {
            url: imageResult.url,
            publicId: imageResult.publicId,
          },
        },
      });
    }
  } catch (error) {
    logger.error('Upload delivery image error:', error);
    next(error);
  }
};

/**
 * Upload delivered image and mark order as delivered
 * This is called when rider uploads delivered image and order status is out_for_delivery
 * Order status will change from out_for_delivery to delivered
 */
exports.uploadDeliveredImage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { orderId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    // Check if image file is provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Delivered image is required. Please upload an image file.',
      });
    }

    // Find the order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Verify order is assigned to this rider
    if (!order.rider || order.rider.toString() !== riderId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'This order is not assigned to you. You can only upload images for your own orders.',
      });
    }

    // Check if order is in out_for_delivery status
    if (order.status !== 'out_for_delivery') {
      return res.status(400).json({
        success: false,
        error: `Order cannot be marked as delivered. Current status: ${order.status}. Order must be in 'out_for_delivery' status.`,
      });
    }

    // Upload image to Cloudinary
    let imageResult;
    try {
      imageResult = await uploadToCloudinary(req.file, 'rush-basket/delivered-images');
    } catch (uploadError) {
      logger.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload image to Cloudinary',
        message: uploadError.message,
      });
    }

    // Delete old delivered image from Cloudinary if exists
    if (order.deliveredImage && order.deliveredImage.publicId) {
      try {
        const { deleteFromCloudinary } = require('../utils/cloudinary');
        await deleteFromCloudinary(order.deliveredImage.publicId);
      } catch (deleteError) {
        logger.error('Error deleting old delivered image:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Update order with delivered image and mark as delivered
    order.deliveredImage = {
      url: imageResult.url,
      publicId: imageResult.publicId,
    };
    order.status = 'delivered';
    order.deliveredAt = new Date();

    await order.save();

    // Add delivery amount minus rider commission to rider's earning wallet
    const deliveryAmount = order.deliveryAmount || order.pricing?.deliveryAmount || 0;
    if (deliveryAmount > 0) {
      try {
        // Get rider to calculate commission
        const rider = await Rider.findById(riderId);
        if (!rider) {
          logger.warn(`Rider ${riderId} not found when updating earning wallet for order ${order.orderNumber}`);
        } else {
          // Calculate commission based on rider's commission type
          let commissionAmount = 0;
          const commission = rider.commission || { type: 'percentage', percentage: 10, fixedAmount: 0 };

          if (commission.type === 'percentage') {
            commissionAmount = (deliveryAmount * (commission.percentage || 10)) / 100;
          } else if (commission.type === 'fixed') {
            commissionAmount = commission.fixedAmount || 0;
          } else if (commission.type === 'hybrid') {
            // Hybrid: percentage + fixed
            const percentageCommission = (deliveryAmount * (commission.percentage || 10)) / 100;
            commissionAmount = percentageCommission + (commission.fixedAmount || 0);
          } else if (commission.type === 'subscription') {
            // For subscription, per-order commission is 0 (subscription fee is deducted separately)
            commissionAmount = 0;
          }

          // Calculate wallet amount: Delivery Amount - Commission
          const walletAmount = deliveryAmount - commissionAmount;

          // Check if already credited for this order
          const alreadyCredited = rider.walletTransactions?.some(
            txn => txn.orderId && txn.orderId.toString() === order._id.toString() &&
              txn.type === 'credit' &&
              txn.description && txn.description.includes('Delivery image upload')
          );

          if (!alreadyCredited && walletAmount > 0) {
            // Update rider's earning wallet
            const updatedRider = await Rider.findOneAndUpdate(
              { _id: riderId },
              {
                $inc: { earningWallet: walletAmount },
                $push: {
                  walletTransactions: {
                    type: 'credit',
                    amount: walletAmount,
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    description: `Delivery image upload for order ${order.orderNumber}. Delivery: ₹${deliveryAmount.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}, Added: ₹${walletAmount.toFixed(2)}`,
                    createdAt: new Date(),
                  }
                }
              },
              {
                new: true,
                runValidators: true,
              }
            );

            if (updatedRider) {
              logger.info(`Delivery amount ₹${deliveryAmount.toFixed(2)} (Commission: ₹${commissionAmount.toFixed(2)}, Added: ₹${walletAmount.toFixed(2)}) added to rider ${riderId} earning wallet for order ${order.orderNumber}`);
            }
          } else if (alreadyCredited) {
            logger.info(`Delivery amount already credited to rider ${riderId} for order ${order.orderNumber}`);
          }
        }
      } catch (earningWalletError) {
        logger.error('Error adding delivery amount to rider earning wallet:', earningWalletError);
        // Don't fail the request if earning wallet update fails
      }
    }

    // Populate order details for response
    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber');

    // Notify all vendors in the order about delivery
    try {
      const { sendVendorPushNotification } = require('../utils/firebaseNotification');
      const vendorIds = new Set();

      // Get all unique vendor IDs from order items
      populatedOrder.items.forEach(item => {
        const itemVendorId = item.vendor?._id || item.vendor;
        if (itemVendorId) {
          vendorIds.add(itemVendorId.toString());
        }
      });

      // Notify each vendor
      for (const vendorId of vendorIds) {
        try {
          await sendVendorPushNotification(vendorId, {
            type: 'order_delivered',
            title: 'Order Delivered',
            message: `Order #${order.orderNumber} has been delivered successfully by rider`,
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: 'delivered',
            data: {
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              status: 'delivered',
              deliveredAt: order.deliveredAt,
              rider: populatedOrder.rider ? {
                _id: populatedOrder.rider._id,
                fullName: populatedOrder.rider.fullName,
                mobileNumber: populatedOrder.rider.mobileNumber,
              } : null,
            },
          });
        } catch (vendorNotifyError) {
          logger.error(`Error sending notification to vendor ${vendorId}:`, vendorNotifyError);
        }
      }
    } catch (notifyError) {
      // Don't fail the request if socket notification fails
      logger.error('Error sending socket notifications for order delivery:', notifyError);
    }

    // Send push notification to user about delivery
    if (populatedOrder.user) {
      try {
        const { sendOrderStatusNotification } = require('../utils/firebaseNotification');
        await sendOrderStatusNotification(populatedOrder.user._id, {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'delivered',
        });
      } catch (pushError) {
        logger.error('Error sending push notification for order delivery:', pushError);
        // Don't fail the request if push notification fails
      }
    }

    // Notify user about delivery (queue for other notification types)
    if (notificationQueue && populatedOrder.user) {
      await notificationQueue.add({
        userId: populatedOrder.user._id,
        type: 'order_delivered',
        title: 'Order Delivered',
        message: `Your order ${order.orderNumber} has been delivered successfully`,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          type: 'user',
        },
      });
    }

    // Notify rider via WebSocket about the delivery completion
    try {
      const { notifyRiderOrderUpdate } = require('../utils/socket');
      const orderUpdateData = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'delivered',
        amount: order.pricing?.total || 0,
        deliveryAmount: order.deliveryAmount || 0,
        deliveredAt: order.deliveredAt,
      };

      notifyRiderOrderUpdate(riderId, orderUpdateData);
    } catch (socketError) {
      logger.error(`Error sending WebSocket notification to rider: ${socketError.message}`);
    }

    logger.info(`Rider ${riderId} uploaded delivered image and marked order ${order.orderNumber} as delivered`);

    res.status(200).json({
      success: true,
      message: 'Delivered image uploaded successfully and order marked as delivered',
      data: {
        order: populatedOrder,
        deliveredImage: {
          url: imageResult.url,
          publicId: imageResult.publicId,
        },
      },
    });
  } catch (error) {
    logger.error('Upload delivered image error:', error);
    next(error);
  }
};

/**
 * Mark order payment as cash and add amount to rider's due wallet
 * This API updates order payment method to cash, marks payment as completed, and adds order total to rider's due wallet
 */
exports.markOrderPaymentAsCash = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    // Find the order
    const order = await Order.findById(orderId)
      .populate('rider', 'fullName mobileNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Check if order has a rider assigned
    if (!order.rider) {
      return res.status(400).json({
        success: false,
        error: 'Order does not have a rider assigned. Please assign a rider first.',
      });
    }

    // Check if order payment method is COD (Cash on Delivery) - This API only works for COD orders
    if (order.payment.method !== 'cod') {
      return res.status(400).json({
        success: false,
        error: 'This API can only be used for COD (Cash on Delivery) orders. Current payment method is not COD.',
        currentPaymentMethod: order.payment.method,
      });
    }

    // Check if payment is already completed
    if (order.payment.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Order payment is already completed',
        currentPaymentStatus: order.payment.status,
      });
    }

    // Get order total amount (only total, not including delivery)
    const orderTotalAmount = order.pricing?.total || order.payment?.amount || 0;
    const deliveryAmount = order.deliveryAmount || order.pricing?.deliveryAmount || 0;

    if (orderTotalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Order total amount is invalid or zero',
      });
    }

    // Update order payment method to cash and mark payment as completed
    order.payment.method = 'cash';
    order.payment.status = 'completed';
    order.payment.paidAt = new Date();
    await order.save();

    // Update rider's due balance directly in Rider model
    const riderId = order.rider._id || order.rider;

    // Get current rider to check previous balance
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    const previousDueBalance = rider.dueBalance || 0;

    // Use findOneAndUpdate for atomic operation to ensure it saves
    const updatedRider = await Rider.findOneAndUpdate(
      { _id: riderId },
      {
        $inc: { dueBalance: orderTotalAmount },
        $push: {
          walletTransactions: {
            type: 'credit',
            amount: orderTotalAmount,
            orderId: order._id,
            orderNumber: order.orderNumber,
            description: `Cash payment for order ${order.orderNumber} - Total amount: ₹${orderTotalAmount}`,
            createdAt: new Date(),
          }
        },
        $setOnInsert: {
          pendingBalance: 0,
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    logger.info(`Order ${order.orderNumber} payment method set to cash and status completed. Amount ₹${orderTotalAmount} added to rider ${order.rider._id} due balance.`);

    // Update vendor wallets: Deduct Commission + Delivery Charge from vendor wallets
    try {
      const Vendor = require('../models/Vendor');
      const logger = require('../utils/logger');

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

          // Use delivery charge directly from order (already saved, no need to calculate)
          // If multiple vendors, split delivery charge proportionally based on vendor subtotal
          let deliveryCharge = 0;
          if (order.pricing?.deliveryAmount) {
            const totalDeliveryAmount = order.pricing.deliveryAmount || 0;
            // If multiple vendors, split proportionally; if single vendor, use full amount
            if (vendorIds.length > 1 && order.pricing?.subtotal && order.pricing.subtotal > 0) {
              const vendorSubtotal = vendorItems.reduce((sum, item) => {
                const itemTotal = item.totalPrice || (item.unitPrice || item.salePrice || 0) * (item.quantity || 0);
                return sum + itemTotal;
              }, 0);
              const deliveryChargeRatio = vendorSubtotal / order.pricing.subtotal;
              deliveryCharge = totalDeliveryAmount * deliveryChargeRatio;
            } else {
              // Single vendor or no subtotal - use full delivery amount
              deliveryCharge = totalDeliveryAmount;
            }
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
            // For subscription, commission is 0 (no per-order commission)
            commissionAmount = 0;
          }

          // Calculate total deduction: Commission + Delivery Charge
          const totalDeduction = commissionAmount + deliveryCharge;

          // Check if already deducted for this order
          const alreadyDeducted = vendor.walletTransactions?.some(
            txn => txn.orderId && txn.orderId.toString() === order._id.toString() &&
              txn.type === 'debit' &&
              txn.description && txn.description.includes('Cash payment - Commission and delivery')
          );

          if (!alreadyDeducted && totalDeduction > 0) {
            // Deduct commission + delivery charge from vendor wallet
            const updatedVendor = await Vendor.findOneAndUpdate(
              { _id: vendorIdStr },
              {
                $inc: { earningWallet: -totalDeduction },
                $push: {
                  walletTransactions: {
                    type: 'debit',
                    amount: totalDeduction,
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    description: `Cash payment for order ${order.orderNumber} - Commission: ₹${commissionAmount.toFixed(2)}, Delivery: ₹${deliveryCharge.toFixed(2)}, Total deducted: ₹${totalDeduction.toFixed(2)}`,
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
              logger.info(`Cash payment: Deducted ₹${totalDeduction.toFixed(2)} from vendor ${vendorIdStr} wallet for order ${order.orderNumber} (Commission: ₹${commissionAmount.toFixed(2)}, Delivery: ₹${deliveryCharge.toFixed(2)})`);
            }
          }
        } catch (vendorError) {
          logger.error(`Error updating vendor ${vendorIdStr} wallet for order ${order.orderNumber}:`, vendorError);
          // Continue with other vendors even if one fails
        }
      }
    } catch (walletError) {
      logger.error('Error updating vendor wallets after cash payment:', walletError);
      // Don't fail the request if wallet update fails
    }

    // Populate order for response
    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail inventory skus')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber');

    res.status(200).json({
      success: true,
      message: 'Order payment method set to cash, payment status completed, and amount added to rider due wallet successfully',
      data: {
        order: populatedOrder,
        rider: {
          riderId: order.rider._id,
          riderName: updatedRider.fullName || updatedRider.mobileNumber,
          previousDueBalance: previousDueBalance.toFixed(2),
          newDueBalance: updatedRider.dueBalance.toFixed(2),
          pendingBalance: (updatedRider.pendingBalance || 0).toFixed(2),
          orderTotalAmount: orderTotalAmount.toFixed(2),
          deliveryAmount: deliveryAmount.toFixed(2),
          addedAmount: orderTotalAmount.toFixed(2),
        },
      },
    });
  } catch (error) {
    logger.error('Mark order payment as cash error:', error);
    next(error);
  }
};

/**
 * Get all riders' due amounts for a vendor
 * This API shows all riders associated with the vendor and their due amounts
 */
exports.getRidersDueAmounts = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find all riders associated with this vendor
    const query = { vendor: vendorId };

    // Optional filters
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }

    // Get riders with their due amounts
    const riders = await Rider.find(query)
      .select('fullName mobileNumber dueBalance pendingBalance earningWallet approvalStatus isActive assignedToVendorAt')
      .sort({ dueBalance: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Rider.countDocuments(query);

    // Calculate total due amount for all riders
    const totalDueAmount = await Rider.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$dueBalance' } } }
    ]);

    const totalDue = totalDueAmount.length > 0 ? totalDueAmount[0].total : 0;

    res.status(200).json({
      success: true,
      count: riders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      summary: {
        totalRiders: total,
        totalDueAmount: totalDue.toFixed(2),
      },
      data: riders.map(rider => ({
        riderId: rider._id,
        fullName: rider.fullName,
        mobileNumber: rider.mobileNumber,
        dueBalance: (rider.dueBalance || 0).toFixed(2),
        pendingBalance: (rider.pendingBalance || 0).toFixed(2),
        earningWallet: (rider.earningWallet || 0).toFixed(2),
        approvalStatus: rider.approvalStatus,
        isActive: rider.isActive,
        assignedToVendorAt: rider.assignedToVendorAt,
      })),
    });
  } catch (error) {
    logger.error('Get riders due amounts error:', error);
    next(error);
  }
};

/**
 * Update rider due amount from vendor API
 * This API allows vendors to update rider due amounts.
 * It only reduces dueBalance by dueAmount and does not modify earningWallet.
 */
exports.updateRiderDueAmount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Check if vendor is authenticated
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

    const vendorId = req.vendor._id;
    const { riderId } = req.params;
    const { dueAmount, orderId, description } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rider ID format',
      });
    }

    // Validate orderId if provided
    if (orderId && !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    // Find the rider
    const rider = await Rider.findById(riderId);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Verify rider is associated with this vendor
    if (!rider.vendor || rider.vendor.toString() !== vendorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'This rider is not associated with your vendor account',
      });
    }

    // Validate deduction amount (amount to subtract from current due)
    const deductionAmount = parseFloat(dueAmount);
    if (isNaN(deductionAmount) || deductionAmount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Due amount must be a valid number greater than or equal to 0',
      });
    }

    // If orderId is provided, validate ownership and include order details in response only.
    let deliveryCharge = 0;
    let orderNumber = null;
    if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      // Verify order is assigned to this rider
      if (!order.rider || order.rider.toString() !== riderId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'This order is not assigned to the specified rider',
        });
      }

      // Keep delivery charge for reference in response (no wallet impact).
      const rawDeliveryCharge = Number(order.pricing?.deliveryAmount ?? order.deliveryAmount ?? 0);
      deliveryCharge = Number.isFinite(rawDeliveryCharge) ? Math.max(rawDeliveryCharge, 0) : 0;
      orderNumber = order.orderNumber;
    }

    const previousDueBalance = Number(rider.dueBalance || 0);
    const previousEarningWallet = Number(rider.earningWallet || 0);

    // Calculate new due amount: current due - deduction amount
    // Allow negative due balance
    const newDueAmount = previousDueBalance - deductionAmount;

    // Earning wallet should not be impacted when vendor updates rider due amount.
    const totalWalletDeduction = 0;
    const newEarningWallet = previousEarningWallet;

    // Update rider's due balance only
    // Use findOneAndUpdate with runValidators: false to allow negative values
    const updatedRider = await Rider.findOneAndUpdate(
      { _id: riderId },
      {
        $inc: {
          dueBalance: -deductionAmount,
        }
      },
      {
        new: true,
        runValidators: false, // Allow negative values
      }
    );

    if (!updatedRider) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update rider',
      });
    }

    logger.info(`Rider ${riderId} due amount updated by vendor ${vendorId}. Previous Due: ₹${previousDueBalance.toFixed(2)}, New Due: ₹${newDueAmount.toFixed(2)}. Earning wallet unchanged at ₹${previousEarningWallet.toFixed(2)}.`);

    res.status(200).json({
      success: true,
      message: 'Rider due amount updated successfully. Earning wallet unchanged.',
      data: {
        rider: {
          riderId: updatedRider._id,
          fullName: updatedRider.fullName,
          mobileNumber: updatedRider.mobileNumber,
        },
        order: orderId ? {
          orderId: orderId,
          orderNumber: orderNumber,
          deliveryCharge: deliveryCharge.toFixed(2),
        } : null,
        dueAmount: {
          previous: previousDueBalance.toFixed(2),
          deducted: deductionAmount.toFixed(2),
          new: newDueAmount.toFixed(2),
        },
        earningWallet: {
          previous: previousEarningWallet.toFixed(2),
          deducted: totalWalletDeduction.toFixed(2),
          new: newEarningWallet.toFixed(2),
        },
        breakdown: {
          dueAmountDeducted: deductionAmount.toFixed(2),
          deliveryChargeReference: deliveryCharge.toFixed(2),
          totalDeducted: totalWalletDeduction.toFixed(2),
        },
        updatedAt: updatedRider.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Update rider due amount error:', error);
    next(error);
  }
};

/**
 * Request withdrawal from rider's earningWallet
 * This API creates a withdrawal request that requires admin approval
 */
exports.sendEarningWalletAmount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { amount, description } = req.body;

    // Validate amount
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid positive number',
      });
    }

    // Find the rider
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Check if rider has sufficient balance
    const currentBalance = rider.earningWallet || 0;
    if (transferAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Your current earning wallet balance is ₹${currentBalance.toFixed(2)}. You cannot request ₹${transferAmount.toFixed(2)}`,
        currentBalance: currentBalance.toFixed(2),
        requestedAmount: transferAmount.toFixed(2),
      });
    }

    // Create withdrawal request
    const withdrawalRequest = await RiderEarningWalletWithdrawal.create({
      rider: riderId,
      amount: transferAmount,
      description: description || `Withdrawal request for ₹${transferAmount.toFixed(2)}`,
      status: 'pending',
      currentBalance: currentBalance,
      requestedAt: new Date(),
    });

    logger.info(`Rider ${riderId} created withdrawal request for ₹${transferAmount.toFixed(2)}. Request ID: ${withdrawalRequest._id}`);

    res.status(200).json({
      success: true,
      message: `Withdrawal request of ₹${transferAmount.toFixed(2)} submitted successfully. It will be processed after admin approval.`,
      data: {
        requestId: withdrawalRequest._id,
        rider: {
          riderId: rider._id,
          fullName: rider.fullName,
          mobileNumber: rider.mobileNumber,
        },
        withdrawalRequest: {
          amount: transferAmount.toFixed(2),
          currentBalance: currentBalance.toFixed(2),
          status: 'pending',
          description: description || `Withdrawal request for ₹${transferAmount.toFixed(2)}`,
          requestedAt: withdrawalRequest.requestedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Create earning wallet withdrawal request error:', error);
    next(error);
  }
};

/**
 * Get all withdrawal requests (Admin only)
 * Admin can view all withdrawal requests with filters
 */
exports.getWithdrawalRequests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by rider
    if (req.query.riderId) {
      query.rider = req.query.riderId;
    }

    // Get withdrawal requests with rider details
    const withdrawalRequests = await RiderEarningWalletWithdrawal.find(query)
      .populate('rider', 'fullName mobileNumber earningWallet')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await RiderEarningWalletWithdrawal.countDocuments(query);

    res.status(200).json({
      success: true,
      count: withdrawalRequests.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: withdrawalRequests.map((request, index) => ({
        sNo: skip + index + 1, // Serial Number based on pagination
        requestId: request._id?.toString() || 'N/A',
        riderName: request.rider?.fullName || 'N/A',
        riderMobile: request.rider?.mobileNumber || 'N/A',
        requestAmount: `₹${parseFloat(request.amount || 0).toFixed(2)}`,
        // Additional fields for reference (can be used if needed)
        riderId: request.rider?._id?.toString() || request.rider?.toString() || null,
        currentBalance: request.currentBalance ? `₹${parseFloat(request.currentBalance).toFixed(2)}` : null,
        description: request.description || null,
        status: request.status,
        requestedAt: request.requestedAt,
        approvedBy: request.approvedBy ? {
          adminId: request.approvedBy._id,
          name: request.approvedBy.name,
          email: request.approvedBy.email,
        } : null,
        approvedAt: request.approvedAt,
        rejectedBy: request.rejectedBy ? {
          adminId: request.rejectedBy._id,
          name: request.rejectedBy.name,
          email: request.rejectedBy.email,
        } : null,
        rejectedAt: request.rejectedAt,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('Get withdrawal requests error:', error);
    next(error);
  }
};

/**
 * Approve withdrawal request (Admin only)
 * This will deduct the amount from rider's earningWallet and create transaction
 */
exports.approveWithdrawalRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { requestId } = req.params;
    const adminId = req.admin._id;

    // Find the withdrawal request
    const withdrawalRequest = await RiderEarningWalletWithdrawal.findById(requestId)
      .populate('rider', 'fullName mobileNumber earningWallet');

    if (!withdrawalRequest) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found',
      });
    }

    // Check if already processed
    if (withdrawalRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `This withdrawal request has already been ${withdrawalRequest.status}`,
        currentStatus: withdrawalRequest.status,
      });
    }

    const rider = withdrawalRequest.rider;
    const currentBalance = rider.earningWallet || 0;
    const withdrawalAmount = withdrawalRequest.amount;

    // Double check balance (in case it changed since request was created)
    if (withdrawalAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        error: `Cannot approve. Rider's current balance (₹${currentBalance.toFixed(2)}) is less than requested amount (₹${withdrawalAmount.toFixed(2)})`,
        riderBalance: currentBalance.toFixed(2),
        requestedAmount: withdrawalAmount.toFixed(2),
      });
    }

    // Calculate new balance
    const newBalance = currentBalance - withdrawalAmount;

    // Use atomic update to deduct amount and create transaction
    const updatedRider = await Rider.findOneAndUpdate(
      { _id: rider._id },
      {
        $inc: { earningWallet: -withdrawalAmount },
        $push: {
          walletTransactions: {
            type: 'debit',
            amount: withdrawalAmount,
            description: withdrawalRequest.description || `Withdrawal approved by admin. Previous balance: ₹${currentBalance.toFixed(2)}, Withdrawn: ₹${withdrawalAmount.toFixed(2)}, New balance: ₹${newBalance.toFixed(2)}`,
            createdAt: new Date(),
          }
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedRider) {
      return res.status(404).json({
        success: false,
        error: 'Failed to update rider wallet',
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'approved';
    withdrawalRequest.approvedBy = adminId;
    withdrawalRequest.approvedAt = new Date();
    withdrawalRequest.transactionId = updatedRider._id;
    await withdrawalRequest.save();

    logger.info(`Admin ${adminId} approved withdrawal request ${requestId} for rider ${rider._id}. Amount: ₹${withdrawalAmount.toFixed(2)}`);

    res.status(200).json({
      success: true,
      message: `Withdrawal request approved successfully. Amount ₹${withdrawalAmount.toFixed(2)} deducted from rider's earning wallet`,
      data: {
        requestId: withdrawalRequest._id,
        rider: {
          riderId: rider._id,
          fullName: rider.fullName,
          mobileNumber: rider.mobileNumber,
        },
        withdrawal: {
          amount: withdrawalAmount.toFixed(2),
          previousBalance: currentBalance.toFixed(2),
          newBalance: updatedRider.earningWallet.toFixed(2),
          status: 'approved',
          approvedBy: adminId,
          approvedAt: withdrawalRequest.approvedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Approve withdrawal request error:', error);
    next(error);
  }
};

/**
 * Reject withdrawal request (Admin only)
 */
exports.rejectWithdrawalRequest = async (req, res, next) => {
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
    const adminId = req.admin._id;

    // Find the withdrawal request
    const withdrawalRequest = await RiderEarningWalletWithdrawal.findById(requestId)
      .populate('rider', 'fullName mobileNumber');

    if (!withdrawalRequest) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal request not found',
      });
    }

    // Check if already processed
    if (withdrawalRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `This withdrawal request has already been ${withdrawalRequest.status}`,
        currentStatus: withdrawalRequest.status,
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'rejected';
    withdrawalRequest.rejectedBy = adminId;
    withdrawalRequest.rejectedAt = new Date();
    if (rejectionReason) {
      withdrawalRequest.rejectionReason = rejectionReason;
    }
    await withdrawalRequest.save();

    logger.info(`Admin ${adminId} rejected withdrawal request ${requestId} for rider ${withdrawalRequest.rider._id}`);

    res.status(200).json({
      success: true,
      message: 'Withdrawal request rejected successfully',
      data: {
        requestId: withdrawalRequest._id,
        rider: {
          riderId: withdrawalRequest.rider._id,
          fullName: withdrawalRequest.rider.fullName,
          mobileNumber: withdrawalRequest.rider.mobileNumber,
        },
        withdrawal: {
          amount: withdrawalRequest.amount.toFixed(2),
          status: 'rejected',
          rejectedBy: adminId,
          rejectedAt: withdrawalRequest.rejectedAt,
          rejectionReason: withdrawalRequest.rejectionReason,
        },
      },
    });
  } catch (error) {
    logger.error('Reject withdrawal request error:', error);
    next(error);
  }
};

/**
 * Get rider's own withdrawal requests
 */
exports.getMyWithdrawalRequests = async (req, res, next) => {
  try {
    const riderId = req.rider._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { rider: riderId };

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Get withdrawal requests
    const withdrawalRequests = await RiderEarningWalletWithdrawal.find(query)
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await RiderEarningWalletWithdrawal.countDocuments(query);

    res.status(200).json({
      success: true,
      count: withdrawalRequests.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: withdrawalRequests.map(request => ({
        requestId: request._id,
        amount: request.amount.toFixed(2),
        currentBalance: request.currentBalance.toFixed(2),
        description: request.description,
        status: request.status,
        requestedAt: request.requestedAt,
        approvedBy: request.approvedBy ? {
          adminId: request.approvedBy._id,
          name: request.approvedBy.name,
          email: request.approvedBy.email,
        } : null,
        approvedAt: request.approvedAt,
        rejectedBy: request.rejectedBy ? {
          adminId: request.rejectedBy._id,
          name: request.rejectedBy.name,
          email: request.rejectedBy.email,
        } : null,
        rejectedAt: request.rejectedAt,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('Get my withdrawal requests error:', error);
    next(error);
  }
};

/**
 * Create rider amount request (for due balance)
 * This API creates a request for payment from rider's due balance that requires admin approval
 */
exports.createDueAmountRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { amount, description } = req.body;

    // Validate amount
    const requestAmount = parseFloat(amount);
    if (isNaN(requestAmount) || requestAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid positive number',
      });
    }

    // Find the rider
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Check if rider has sufficient due balance
    const currentDueBalance = rider.dueBalance || 0;
    if (requestAmount > currentDueBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient due balance. Your current due balance is ₹${currentDueBalance.toFixed(2)}. You cannot request ₹${requestAmount.toFixed(2)}`,
        currentDueBalance: currentDueBalance.toFixed(2),
        requestedAmount: requestAmount.toFixed(2),
      });
    }

    // Create amount request
    const amountRequest = await RiderDueAmountRequest.create({
      rider: riderId,
      amount: requestAmount,
      description: description || `Amount request for ₹${requestAmount.toFixed(2)} from due balance`,
      status: 'pending',
      currentDueBalance: currentDueBalance,
      requestedAt: new Date(),
    });

    logger.info(`Rider ${riderId} created amount request for ₹${requestAmount.toFixed(2)}. Request ID: ${amountRequest._id}`);

    res.status(200).json({
      success: true,
      message: `Amount request of ₹${requestAmount.toFixed(2)} submitted successfully. It will be processed after admin approval.`,
      data: {
        requestId: amountRequest._id,
        rider: {
          riderId: rider._id,
          fullName: rider.fullName,
          mobileNumber: rider.mobileNumber,
        },
        amountRequest: {
          amount: requestAmount.toFixed(2),
          currentDueBalance: currentDueBalance.toFixed(2),
          status: 'pending',
          description: description || `Amount request for ₹${requestAmount.toFixed(2)} from due balance`,
          requestedAt: amountRequest.requestedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Create rider amount request error:', error);
    next(error);
  }
};

/**
 * Update rider commission (Admin only)
 * PUT /api/admin/riders/:id/commission
 */
exports.updateRiderCommission = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.params.id;
    const { type, percentage, fixedAmount, subscriptionAmount, subscriptionPeriod } = req.body;
    const adminId = req.admin._id;

    if (!riderId) {
      return res.status(400).json({
        success: false,
        error: 'Rider ID is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rider ID format',
      });
    }

    const rider = await Rider.findById(riderId);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Validate commission type
    const validTypes = ['percentage', 'fixed', 'hybrid', 'subscription'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid commission type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Initialize commission object if it doesn't exist
    if (!rider.commission) {
      rider.commission = {
        type: 'percentage',
        percentage: 10,
        fixedAmount: 0,
        subscriptionAmount: 0,
        subscriptionPeriod: 'monthly',
      };
    }

    // Check if commission type is being changed
    const isCommissionTypeChanged = type !== undefined && rider.commission.type !== type;
    const currentDate = new Date();

    // Update commission fields
    if (type !== undefined) {
      rider.commission.type = type;
    }

    if (percentage !== undefined) {
      const percentageValue = parseFloat(percentage);
      if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
        return res.status(400).json({
          success: false,
          error: 'Commission percentage must be between 0 and 100',
        });
      }
      rider.commission.percentage = percentageValue;
    }

    if (fixedAmount !== undefined) {
      const fixedValue = parseFloat(fixedAmount);
      if (isNaN(fixedValue) || fixedValue < 0) {
        return res.status(400).json({
          success: false,
          error: 'Fixed commission amount must be greater than or equal to 0',
        });
      }
      rider.commission.fixedAmount = fixedValue;
    }

    if (subscriptionAmount !== undefined) {
      const subscriptionValue = parseFloat(subscriptionAmount);
      if (isNaN(subscriptionValue) || subscriptionValue < 0) {
        return res.status(400).json({
          success: false,
          error: 'Subscription amount must be greater than or equal to 0',
        });
      }
      rider.commission.subscriptionAmount = subscriptionValue;
    }

    if (subscriptionPeriod !== undefined) {
      if (!['monthly', 'yearly'].includes(subscriptionPeriod)) {
        return res.status(400).json({
          success: false,
          error: 'Subscription period must be either "monthly" or "yearly"',
        });
      }
      rider.commission.subscriptionPeriod = subscriptionPeriod;
    }

    // Update metadata for this rider
    rider.commission.updatedBy = adminId;
    rider.commission.updatedAt = currentDate;

    // Handle subscription commission: Deduct amount when subscription is set/updated
    const isSubscriptionType = (type !== undefined && type === 'subscription') ||
      (type === undefined && rider.commission.type === 'subscription');
    const isSubscriptionAmountChanged = subscriptionAmount !== undefined &&
      rider.commission.subscriptionAmount !== subscriptionAmount;
    const isSubscriptionTypeChanged = type !== undefined &&
      rider.commission.type !== 'subscription' &&
      type === 'subscription';

    if (isSubscriptionType && (isSubscriptionAmountChanged || isSubscriptionTypeChanged)) {
      const subscriptionAmountToDeduct = subscriptionAmount !== undefined ?
        parseFloat(subscriptionAmount) :
        rider.commission.subscriptionAmount || 0;

      if (subscriptionAmountToDeduct > 0) {
        // Deduct subscription amount from rider earning wallet (can go negative)
        const currentBalance = rider.earningWallet || 0;
        rider.earningWallet = currentBalance - subscriptionAmountToDeduct;

        // Add transaction record
        rider.walletTransactions = rider.walletTransactions || [];
        rider.walletTransactions.push({
          type: 'debit',
          amount: subscriptionAmountToDeduct,
          description: `Subscription commission ${rider.commission.subscriptionPeriod || 'monthly'} fee deducted. Amount: ₹${subscriptionAmountToDeduct.toFixed(2)}`,
          createdAt: new Date(),
        });

        // Set subscription deduction date (day of month for monthly, day of year for yearly)
        const today = new Date();
        if (!rider.commission.subscriptionDeductionDate) {
          if (rider.commission.subscriptionPeriod === 'monthly') {
            rider.commission.subscriptionDeductionDate = today.getDate(); // Day of month (1-31)
          } else {
            // For yearly, use day of year (1-365)
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            const dayOfYear = Math.floor((today - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
            rider.commission.subscriptionDeductionDate = dayOfYear;
          }
        }

        // Set last and next deduction dates
        rider.commission.lastSubscriptionDeduction = today;

        // Calculate next deduction date
        const nextDeduction = new Date(today);
        if (rider.commission.subscriptionPeriod === 'monthly') {
          nextDeduction.setMonth(nextDeduction.getMonth() + 1);
          // Ensure same day of month
          const deductionDay = rider.commission.subscriptionDeductionDate;
          const lastDayOfMonth = new Date(nextDeduction.getFullYear(), nextDeduction.getMonth() + 1, 0).getDate();
          nextDeduction.setDate(Math.min(deductionDay, lastDayOfMonth));
        } else {
          // Yearly
          nextDeduction.setFullYear(nextDeduction.getFullYear() + 1);
        }
        rider.commission.nextSubscriptionDeduction = nextDeduction;

        logger.info(`Subscription commission ₹${subscriptionAmountToDeduct.toFixed(2)} deducted from rider ${riderId} wallet. Next deduction: ${nextDeduction.toISOString()}`);
      }
    }

    await rider.save();

    // If commission type is changed, update all riders' commission dates to current date
    if (isCommissionTypeChanged) {
      try {
        await Rider.updateMany(
          { _id: { $ne: rider._id } }, // Exclude the current rider
          {
            $set: {
              'commission.updatedAt': currentDate,
              'commission.updatedBy': adminId,
            },
          }
        );
        logger.info(`Admin ${adminId} changed commission type to ${type}. Updated all riders' commission dates.`);
      } catch (updateError) {
        logger.error('Error updating all riders commission dates:', updateError);
        // Don't fail the request if bulk update fails, just log it
      }
    }

    const populatedRider = await Rider.findById(rider._id)
      .populate('commission.updatedBy', 'name email')
      .select('commission fullName mobileNumber');

    logger.info(`Admin ${adminId} updated commission for rider ${riderId}`);

    res.status(200).json({
      success: true,
      message: 'Rider commission updated successfully',
      data: {
        riderId: populatedRider._id,
        fullName: populatedRider.fullName,
        mobileNumber: populatedRider.mobileNumber,
        commission: {
          type: populatedRider.commission.type,
          percentage: populatedRider.commission.percentage,
          fixedAmount: populatedRider.commission.fixedAmount,
          subscriptionAmount: populatedRider.commission.subscriptionAmount,
          subscriptionPeriod: populatedRider.commission.subscriptionPeriod,
          updatedBy: populatedRider.commission.updatedBy || null,
          updatedAt: populatedRider.commission.updatedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Update rider commission error:', error);
    next(error);
  }
};

/**
 * Get all riders' earning wallets (Admin only)
 * GET /api/admin/riders/wallets
 */
exports.getAllRidersWallets = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    // Optional search by rider name or mobile number
    if (req.query.search) {
      query.$or = [
        { fullName: { $regex: req.query.search, $options: 'i' } },
        { mobileNumber: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    // Optional filter by approvalStatus
    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }

    // Optional filter by isActive
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    // Get total count
    const total = await Rider.countDocuments(query);

    // Get riders with wallet and commission information
    const riders = await Rider.find(query)
      .select('fullName mobileNumber earningWallet dueBalance pendingBalance approvalStatus isActive commission createdAt')
      .populate('commission.updatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Format response
    const wallets = riders.map(rider => ({
      riderId: rider._id,
      fullName: rider.fullName || 'N/A',
      mobileNumber: rider.mobileNumber || 'N/A',
      walletBalance: rider.earningWallet || 0,
      dueBalance: rider.dueBalance || 0,
      pendingBalance: rider.pendingBalance || 0,
      commissionType: rider.commission?.type || 'percentage',
      commissionPercentage: rider.commission?.percentage || 0,
      commissionFixedAmount: rider.commission?.fixedAmount || 0,
      commissionSubscriptionAmount: rider.commission?.subscriptionAmount || 0,
      commissionSubscriptionPeriod: rider.commission?.subscriptionPeriod || null,
      commissionUpdatedAt: rider.commission?.updatedAt || null,
      commissionUpdatedBy: rider.commission?.updatedBy ? {
        id: rider.commission.updatedBy._id,
        name: rider.commission.updatedBy.name,
        email: rider.commission.updatedBy.email,
      } : null,
      approvalStatus: rider.approvalStatus || 'pending',
      isActive: rider.isActive !== undefined ? rider.isActive : true,
      createdAt: rider.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        wallets,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get all riders wallets error:', error);
    next(error);
  }
};
