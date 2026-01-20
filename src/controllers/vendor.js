const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { createVendorData, updateVendorPermissions } = require('../services/vendorService');
const { deleteFromCloudinary } = require('../utils/cloudinary');

exports.createVendor = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber } = req.body;

    const vendor = await Vendor.findOne({ 
      contactNumber: contactNumber, 
      contactNumberVerified: true 
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found. Please verify your contact number with OTP first.',
      });
    }

    if (vendor.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor already registered',
      });
    }

    const { email } = req.body;
    if (email) {
      const existingEmail = await Vendor.findOne({ 
        email, 
        _id: { $ne: vendor._id } 
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists',
        });
      }
    }

    // Ensure vendor doesn't have storeId set before creating
    if (vendor.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor already has a store ID. Cannot create again.',
      });
    }

    await createVendorData(vendor, req.body, req.files, req.admin._id);
    
    // Ensure storeId is set before saving
    if (!vendor.storeId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate store ID. Please try again.',
      });
    }
    
    // Mark as modified and save - this ensures we're updating, not inserting
    vendor.markModified('storeId');
    vendor.markModified('documents');
    vendor.markModified('storeAddress');
    vendor.markModified('bankDetails');
    await vendor.save();

    logger.info(`Vendor created: ${vendor.storeId} (ID: ${vendor._id}) by Admin: ${req.admin.email || req.admin._id}`);

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully',
      data: populatedVendor,
    });
  } catch (error) {
    logger.error('Create vendor error:', error);
    
    // Handle MongoDB duplicate key error for storeId
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      if (field === 'storeId') {
        // Retry with a new storeId if duplicate
        try {
          const newStoreId = await Vendor.generateStoreId();
          vendor.storeId = newStoreId;
          await vendor.save();
          
          logger.info(`Vendor created with retry: ${vendor.storeId} (ID: ${vendor._id}) by Admin: ${req.admin.email || req.admin._id}`);
          
          const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');
          
          return res.status(201).json({
            success: true,
            message: 'Vendor registered successfully',
            data: populatedVendor,
          });
        } catch (retryError) {
          logger.error('Retry vendor creation error:', retryError);
          return res.status(500).json({
            success: false,
            error: 'Failed to create vendor. Please try again.',
          });
        }
      }
      return res.status(400).json({
        success: false,
        error: `${field === 'contactNumber' ? 'Contact number' : field === 'email' ? 'Email' : 'Store ID'} already exists`,
      });
    }
    
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message === 'Invalid permissions format' || error.message === 'Bank name is required') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes('store ID') || error.message.includes('storeId')) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.updateVendorPermissions = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { permissions } = req.body;
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    try {
      updateVendorPermissions(vendor, permissions);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    await vendor.save();

    logger.info(`Vendor permissions updated: ${vendor.storeId} by Admin: ${req.admin.email}`);

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor permissions updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
    logger.error('Update vendor permissions error:', error);
    next(error);
  }
};

exports.getVendors = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const vendors = await Vendor.find()
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Vendor.countDocuments();

    res.status(200).json({
      success: true,
      count: vendors.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: vendors,
    });
  } catch (error) {
    logger.error('Get vendors error:', error);
    next(error);
  }
};

exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id).populate('createdBy', 'name email');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Get vendor error:', error);
    next(error);
  }
};


exports.suspendVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    vendor.isActive = !vendor.isActive;
    await vendor.save();

    const action = vendor.isActive ? 'activated' : 'suspended';
    logger.info(`Vendor ${action}: ${vendor.storeId} (ID: ${vendor._id}) by Admin: ${req.admin.email || req.admin._id}`);

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: `Vendor ${action} successfully`,
      data: populatedVendor,
    });
  } catch (error) {
    logger.error('Suspend vendor error:', error);
    next(error);
  }
};

exports.updateVendorDocuments = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    if (!vendor.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor registration not completed',
      });
    }

    const { deleteFromCloudinary } = require('../utils/cloudinary');
    const { uploadVendorFiles } = require('../services/vendorService');

    const uploadedFiles = await uploadVendorFiles(req.files);

    // Delete old documents if new ones are uploaded
    if (uploadedFiles.panCardFront) {
      if (vendor.documents?.panCardFront?.publicId) {
        await deleteFromCloudinary(vendor.documents.panCardFront.publicId);
      }
      vendor.documents = vendor.documents || {};
      vendor.documents.panCardFront = uploadedFiles.panCardFront;
    }

    if (uploadedFiles.panCardBack) {
      if (vendor.documents?.panCardBack?.publicId) {
        await deleteFromCloudinary(vendor.documents.panCardBack.publicId);
      }
      vendor.documents = vendor.documents || {};
      vendor.documents.panCardBack = uploadedFiles.panCardBack;
    }

    if (uploadedFiles.aadharCardFront) {
      if (vendor.documents?.aadharCardFront?.publicId) {
        await deleteFromCloudinary(vendor.documents.aadharCardFront.publicId);
      }
      vendor.documents = vendor.documents || {};
      vendor.documents.aadharCardFront = uploadedFiles.aadharCardFront;
    }

    if (uploadedFiles.aadharCardBack) {
      if (vendor.documents?.aadharCardBack?.publicId) {
        await deleteFromCloudinary(vendor.documents.aadharCardBack.publicId);
      }
      vendor.documents = vendor.documents || {};
      vendor.documents.aadharCardBack = uploadedFiles.aadharCardBack;
    }

    if (uploadedFiles.drivingLicense) {
      if (vendor.documents?.drivingLicense?.publicId) {
        await deleteFromCloudinary(vendor.documents.drivingLicense.publicId);
      }
      vendor.documents = vendor.documents || {};
      vendor.documents.drivingLicense = uploadedFiles.drivingLicense;
    }

    if (uploadedFiles.cancelCheque) {
      if (vendor.bankDetails?.cancelCheque?.publicId) {
        await deleteFromCloudinary(vendor.bankDetails.cancelCheque.publicId);
      }
      vendor.bankDetails = vendor.bankDetails || {};
      vendor.bankDetails.cancelCheque = uploadedFiles.cancelCheque;
    }

    await vendor.save();

    logger.info(`Vendor documents updated: ${vendor.storeId} (ID: ${vendor._id}) by Admin: ${req.admin.email || req.admin._id}`);

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor documents updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
    logger.error('Update vendor documents error:', error);
    next(error);
  }
};

exports.updateVendorRadius = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { serviceRadius } = req.body;
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    if (!vendor.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor registration not completed',
      });
    }

    // Check if vendor is trying to update their own radius or admin is updating
    if (req.vendor && req.vendor._id.toString() !== vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own service radius',
      });
    }

    vendor.serviceRadius = parseFloat(serviceRadius);
    await vendor.save();

    const updatedBy = req.admin 
      ? `Admin: ${req.admin.email || req.admin._id}` 
      : `Vendor: ${req.vendor.vendorName || req.vendor.contactNumber}`;

    logger.info(`Vendor service radius updated: ${vendor.storeId} to ${serviceRadius} km by ${updatedBy}`);

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor service radius updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
    logger.error('Update vendor radius error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    const deletePromises = [];

    if (vendor.storeImage && vendor.storeImage.length > 0) {
      vendor.storeImage.forEach((image) => {
        if (image.publicId) {
          deletePromises.push(deleteFromCloudinary(image.publicId));
        }
      });
    }

    if (vendor.documents?.panCard?.publicId) {
      deletePromises.push(deleteFromCloudinary(vendor.documents.panCard.publicId));
    }

    if (vendor.documents?.aadharCard?.publicId) {
      deletePromises.push(deleteFromCloudinary(vendor.documents.aadharCard.publicId));
    }

    if (vendor.bankDetails?.cancelCheque?.publicId) {
      deletePromises.push(deleteFromCloudinary(vendor.bankDetails.cancelCheque.publicId));
    }

    await Promise.allSettled(deletePromises);

    const storeId = vendor.storeId;
    const vendorId = vendor._id;
    await Vendor.findByIdAndDelete(vendor._id);

    logger.info(`Vendor deleted: ${storeId} (ID: ${vendorId}) by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully',
    });
  } catch (error) {
    logger.error('Delete vendor error:', error);
    next(error);
  }
};

exports.getVendorOrders = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = {
      'items.vendor': vendorId,
    };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('user', 'name email contactNumber')
      .populate('items.product', 'name description')
      .populate('rider', 'riderName contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const filteredOrders = orders.map((order) => {
      const vendorItems = order.items.filter((item) => {
        const itemVendorId = item.vendor?._id || item.vendor;
        return itemVendorId && itemVendorId.toString() === vendorId.toString();
      });
      
      const vendorSubtotal = vendorItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );

      return {
        ...order,
        items: vendorItems,
        vendorSubtotal,
      };
    });

    const total = await Order.countDocuments(query);

    logger.info(`Vendor orders retrieved: ${vendorId} - Total: ${total}`);

    res.status(200).json({
      success: true,
      count: filteredOrders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: filteredOrders,
    });
  } catch (error) {
    logger.error('Get vendor orders error:', error);
    next(error);
  }
};

exports.getVendorOrderById = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('user', 'name email contactNumber')
      .populate('items.product', 'name description')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'riderName contactNumber')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const hasVendorItems = order.items.some((item) => {
      const itemVendorId = item.vendor?._id || item.vendor;
      return itemVendorId && itemVendorId.toString() === vendorId.toString();
    });

    if (!hasVendorItems) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this order',
      });
    }

    const vendorItems = order.items.filter((item) => {
      const itemVendorId = item.vendor?._id || item.vendor;
      return itemVendorId && itemVendorId.toString() === vendorId.toString();
    });

    const vendorSubtotal = vendorItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    const filteredOrder = {
      ...order,
      items: vendorItems,
      vendorSubtotal,
    };

    logger.info(`Vendor order retrieved: ${orderId} by Vendor: ${req.vendor.storeId || req.vendor._id}`);

    res.status(200).json({
      success: true,
      data: filteredOrder,
    });
  } catch (error) {
    logger.error('Get vendor order by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID',
      });
    }
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

    const vendorId = req.vendor._id;
    const orderId = req.params.id;
    const { status, notes } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const hasVendorItems = order.items.some((item) => {
      const itemVendorId = item.vendor?._id || item.vendor;
      return itemVendorId && itemVendorId.toString() === vendorId.toString();
    });

    if (!hasVendorItems) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this order',
      });
    }

    const validStatuses = [
      'pending',
      'confirmed',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const previousStatus = order.status;

    order.status = status;

    if (status === 'delivered' && !order.deliveredAt) {
      order.deliveredAt = new Date();
    } else if (status === 'cancelled' && !order.cancelledAt) {
      order.cancelledAt = new Date();
      order.cancelledBy = 'vendor';
    }

    if (notes !== undefined) {
      order.notes = notes;
    }

    await order.save();

    // If status changed to 'ready', notify riders
    if (status === 'ready' && previousStatus !== 'ready') {
      try {
        const checkoutService = require('../services/checkoutService');
        // Get fresh order with populated fields
        const orderForNotification = await Order.findById(orderId);
        if (orderForNotification) {
          await checkoutService.notifyRidersForOrder(orderForNotification);
        }
      } catch (notifyError) {
        logger.error(`Error notifying riders after status update: ${notifyError.message}`);
        // Don't fail the request if notification fails
      }
    }

    logger.info(
      `Order status updated: ${order.orderNumber} from ${previousStatus} to ${status} by Vendor: ${req.vendor.storeId || req.vendor._id}`
    );

    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'name email contactNumber')
      .populate('items.product', 'name description')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'riderName contactNumber');

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: populatedOrder,
    });
  } catch (error) {
    logger.error('Update order status error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

// Assign rider to order
exports.assignRiderToOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Only vendors can assign riders
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can assign riders to orders',
      });
    }

    const { orderId } = req.params;
    const { riderId, assignmentNotes, updateStatus } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rider ID format',
      });
    }

    // Find order and verify it belongs to this vendor using MongoDB query
    // This ensures we only get orders that have items from this vendor
    const order = await Order.findOne({
      _id: orderId,
      'items.vendor': req.vendor._id,
    }).populate('items.vendor', '_id vendorName storeName');

    if (!order) {
      // Check if order exists at all
      const orderExists = await Order.findById(orderId);
      if (orderExists) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to assign riders to this order. This order does not contain items from your store.',
        });
      }
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Additional verification (redundant but safe)
    const hasVendorItems = order.items.some((item) => {
      if (!item.vendor) {
        return false;
      }
      // If vendor is populated (object), use _id, otherwise use directly (ObjectId)
      const itemVendorId = item.vendor._id ? item.vendor._id : item.vendor;
      return itemVendorId && itemVendorId.toString() === req.vendor._id.toString();
    });

    if (!hasVendorItems) {
      logger.warn(`Vendor ${req.vendor._id} attempted to assign rider to order ${orderId} but validation failed`, {
        orderItems: order.items.map(item => ({
          vendor: item.vendor?.toString() || item.vendor,
          productName: item.productName,
        })),
        vendorId: req.vendor._id.toString(),
      });
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to assign riders to this order. This order does not contain items from your store.',
      });
    }

    if (!hasVendorItems) {
      logger.warn(`Vendor ${req.vendor._id} attempted to assign rider to order ${orderId} but order does not belong to them`, {
        orderItems: order.items.map(item => ({
          vendor: item.vendor?.toString() || item.vendor,
          productName: item.productName,
        })),
        vendorId: req.vendor._id.toString(),
      });
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to assign riders to this order. This order does not contain items from your store.',
        debug: process.env.NODE_ENV === 'development' ? {
          orderVendors: order.items.map(item => item.vendor?.toString() || item.vendor),
          yourVendorId: req.vendor._id.toString(),
        } : undefined,
      });
    }

    // Check if order is in a state where rider can be assigned
    const assignableStatuses = ['ready', 'processing', 'confirmed'];
    if (!assignableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot assign rider. Order must be in one of these statuses: ${assignableStatuses.join(', ')}. Current status: ${order.status}`,
      });
    }

    // Check if rider already assigned
    if (order.rider) {
      return res.status(400).json({
        success: false,
        error: 'A rider has already been assigned to this order',
      });
    }

    // Validate rider exists and is active
    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!rider.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot assign inactive rider',
      });
    }

    if (rider.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Cannot assign rider. Rider approval is pending or rejected',
      });
    }

    // Assign rider to order
    order.rider = riderId;
    order.assignedBy = req.vendor._id;
    order.assignedAt = new Date();
    if (assignmentNotes) {
      order.assignmentNotes = assignmentNotes;
    }

    // Optionally update order status to 'out_for_delivery'
    if (updateStatus === true || updateStatus === 'true') {
      order.status = 'out_for_delivery';
    }

    await order.save();

    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'name email contactNumber')
      .populate('items.product', 'productName description')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber')
      .populate('assignedBy', 'vendorName storeName contactNumber');

    logger.info(
      `Rider ${rider.mobileNumber} assigned to order ${order.orderNumber} by Vendor: ${req.vendor.storeId || req.vendor._id}`
    );

    res.status(200).json({
      success: true,
      message: 'Rider assigned to order successfully',
      data: populatedOrder,
    });
  } catch (error) {
    logger.error('Assign rider to order error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};
