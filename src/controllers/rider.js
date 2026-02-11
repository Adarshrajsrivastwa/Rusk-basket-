const Rider = require('../models/Rider');
const Order = require('../models/Order');
const RiderJobApplication = require('../models/RiderJobApplication');
const RiderJobPost = require('../models/RiderJobPost');
const { notificationQueue } = require('../utils/queue');
const { notifyRiderOrderUpdate } = require('../utils/socket');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateRiderProfileData } = require('../services/riderService');
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

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error('Get rider profile error:', error);
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

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully. Status set to pending for approval.',
      data: rider,
    });
  } catch (error) {
    logger.error('Update rider profile error:', error);
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

    // Add delivery amount to rider's earning wallet
    const deliveryAmount = order.deliveryAmount || order.pricing?.deliveryAmount || 0;
    if (deliveryAmount > 0) {
      try {
        const updatedRider = await Rider.findOneAndUpdate(
          { _id: riderId },
          {
            $inc: { earningWallet: deliveryAmount },
          },
          {
            new: true,
            runValidators: true,
          }
        );

        if (updatedRider) {
          logger.info(`Delivery amount ₹${deliveryAmount} added to rider ${riderId} earning wallet for order ${order.orderNumber}`);
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

    // Check if payment method is already cash
    if (order.payment.method === 'cash') {
      return res.status(400).json({
        success: false,
        error: 'Order payment method is already set to cash',
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
 * This API allows vendors to parse and update rider due amounts
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
    const { dueAmount, description } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rider ID format',
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

    const previousDueBalance = rider.dueBalance || 0;
    
    // Calculate new due amount: current due - deduction amount
    const newDueAmount = previousDueBalance - deductionAmount;
    
    // Ensure due amount doesn't go negative
    if (newDueAmount < 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot deduct ₹${deductionAmount.toFixed(2)}. Current due balance is only ₹${previousDueBalance.toFixed(2)}. Maximum deduction allowed: ₹${previousDueBalance.toFixed(2)}`,
      });
    }

    const amountDifference = newDueAmount - previousDueBalance; // This will be negative (reduction)

    // Update rider's due balance
    rider.dueBalance = newDueAmount;

    // Record transaction for due reduction
    const reducedAmount = Math.abs(amountDifference); // This is the deduction amount
    
    rider.walletTransactions.push({
      type: 'debit',
      amount: reducedAmount,
      description: description || `Due amount deducted by vendor. Previous: ₹${previousDueBalance.toFixed(2)}, Deducted: ₹${deductionAmount.toFixed(2)}, New Due: ₹${newDueAmount.toFixed(2)}`,
      createdAt: new Date(),
    });

    await rider.save();

    logger.info(`Rider ${riderId} due amount updated by vendor ${vendorId}. Previous: ₹${previousDueBalance.toFixed(2)}, New: ₹${newDueAmount.toFixed(2)}`);

    res.status(200).json({
      success: true,
      message: 'Rider due amount updated successfully',
      data: {
        rider: {
          riderId: rider._id,
          fullName: rider.fullName,
          mobileNumber: rider.mobileNumber,
        },
        dueAmount: {
          previous: previousDueBalance.toFixed(2),
          deducted: deductionAmount.toFixed(2),
          new: newDueAmount.toFixed(2),
          difference: amountDifference.toFixed(2),
        },
        updatedAt: rider.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Update rider due amount error:', error);
    next(error);
  }
};
