const Rider = require('../models/Rider');
const Order = require('../models/Order');
const RiderJobApplication = require('../models/RiderJobApplication');
const RiderJobPost = require('../models/RiderJobPost');
const { notificationQueue } = require('../utils/queue');
const { notifyRiderOrderUpdate } = require('../utils/socket');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateRiderProfileData } = require('../services/riderService');

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
      .populate('items.product', 'productName thumbnail')
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
          status: 'out_for_delivery',
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
      .populate('items.product', 'productName thumbnail')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber');

    if (notificationQueue && populatedOrder.user) {
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
          type: 'user',
        },
      });
    }

    // Notify rider via WebSocket about the assignment with amount and location
    try {
      const orderUpdateData = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'out_for_delivery',
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
      .populate('items.product', 'productName thumbnail')
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

