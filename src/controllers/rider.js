const Rider = require('../models/Rider');
const Order = require('../models/Order');
const RiderJobApplication = require('../models/RiderJobApplication');
const RiderJobPost = require('../models/RiderJobPost');
const { notificationQueue } = require('../utils/queue');
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

    // Find vendors this rider is assigned to
    const riderApplications = await RiderJobApplication.find({
      rider: riderId,
      status: 'assigned',
    }).populate('jobPost', 'vendor');

    const vendorIds = riderApplications
      .map(app => app.jobPost?.vendor)
      .filter(Boolean)
      .map(vendor => vendor._id || vendor);

    if (vendorIds.length === 0) {
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
        message: 'No vendors assigned. You need to be assigned to a vendor to receive orders.',
      });
    }

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

    // Verify rider is assigned to the vendor
    const vendorIds = [...new Set(order.items.map(item => {
      const vendorId = item.vendor?._id || item.vendor;
      return vendorId?.toString();
    }).filter(Boolean))];

    const riderApplications = await RiderJobApplication.find({
      rider: riderId,
      status: 'assigned',
    }).populate('jobPost', 'vendor');

    const assignedVendorIds = riderApplications
      .map(app => app.jobPost?.vendor)
      .filter(Boolean)
      .map(vendor => (vendor._id || vendor).toString());

    const hasAccess = vendorIds.some(vid => assignedVendorIds.includes(vid));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned to any vendor for this order',
      });
    }

    // Check if rider has a pending assignment request
    const riderRequest = order.assignmentRequestSentTo?.find(
      req => req.rider?.toString() === riderId.toString()
    );

    if (!riderRequest && order.assignmentRequestSentTo?.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'You were not notified about this order',
      });
    }

    // Assign rider to order
    order.rider = riderId;
    order.assignedAt = new Date();
    order.status = 'out_for_delivery';
    
    // Update assignment request status
    if (riderRequest) {
      riderRequest.status = 'accepted';
      riderRequest.respondedAt = new Date();
    }

    // Mark other pending requests as expired
    if (order.assignmentRequestSentTo) {
      order.assignmentRequestSentTo.forEach(req => {
        if (req.rider?.toString() !== riderId.toString() && req.status === 'pending') {
          req.status = 'expired';
          req.respondedAt = new Date();
        }
      });
    }

    await order.save();

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

