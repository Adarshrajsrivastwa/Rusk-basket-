const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const Ticket = require('../models/Ticket');
const VendorEarningWalletWithdrawal = require('../models/VendorEarningWalletWithdrawal');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { createVendorData, updateVendorPermissions, updateVendorData } = require('../services/vendorService');
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

    // Ensure files is defined (can be empty object if no files uploaded)
    const files = req.files || {};
    await createVendorData(vendor, req.body, files, req.admin._id);
    
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

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully',
      data: populatedVendor,
    });
  } catch (error) {
    // Handle MongoDB duplicate key error for storeId
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      if (field === 'storeId') {
        // Retry with a new storeId if duplicate
        try {
          const newStoreId = await Vendor.generateStoreId();
          vendor.storeId = newStoreId;
          await vendor.save();
          
          const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');
          
          return res.status(201).json({
            success: true,
            message: 'Vendor registered successfully',
            data: populatedVendor,
          });
        } catch (retryError) {
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

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor permissions updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
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

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: `Vendor ${action} successfully`,
      data: populatedVendor,
    });
  } catch (error) {
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

    if (uploadedFiles.profileImage) {
      // Delete old profile image if exists
      if (vendor.profileImage?.publicId) {
        await deleteFromCloudinary(vendor.profileImage.publicId);
      }
      vendor.profileImage = uploadedFiles.profileImage;
    }

    await vendor.save();

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor documents updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
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

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor service radius updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.updateVendorHandlingCharge = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { handlingChargePercentage } = req.body;
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

    // Check if vendor is trying to update their own handling charge or admin is updating
    if (req.vendor && req.vendor._id.toString() !== vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own handling charge percentage',
      });
    }

    vendor.handlingChargePercentage = parseFloat(handlingChargePercentage);
    await vendor.save();

    const updatedBy = req.admin 
      ? `Admin: ${req.admin.email || req.admin._id}` 
      : `Vendor: ${req.vendor.vendorName || req.vendor.contactNumber}`;

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor handling charge percentage updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
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

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully',
    });
  } catch (error) {
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
    next(error);
  }
};

exports.getVendorOrderById = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const orderId = req.params.id;

    let order;
    // Check if orderId is a valid ObjectId, otherwise search by orderNumber
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId)
        .populate('user', 'name email contactNumber')
        .populate('items.product', 'name description')
        .populate('items.vendor', 'vendorName storeName')
        .populate('rider', 'riderName contactNumber')
        .lean();
    } else {
      // Search by orderNumber
      order = await Order.findOne({ orderNumber: orderId })
        .populate('user', 'name email contactNumber')
        .populate('items.product', 'name description')
        .populate('items.vendor', 'vendorName storeName')
        .populate('rider', 'riderName contactNumber')
        .lean();
    }

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

    res.status(200).json({
      success: true,
      data: filteredOrder,
    });
  } catch (error) {
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
    const { status, notes, deliveryAmount } = req.body;

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
      
      // Add vendor's order amount to earningWallet when order is delivered (only if not already credited)
      // Check if this order was already processed by checking walletTransactions
      try {
        const vendor = await Vendor.findById(vendorId);
        if (vendor) {
          const alreadyCredited = vendor.walletTransactions?.some(
            txn => txn.orderId && txn.orderId.toString() === order._id.toString() && txn.type === 'credit'
          );
          
          if (!alreadyCredited) {
            // Calculate vendor's share from order items
            const vendorItems = order.items.filter(item => {
              const itemVendorId = item.vendor?._id || item.vendor;
              return itemVendorId && itemVendorId.toString() === vendorId.toString();
            });
            
            if (vendorItems.length > 0) {
              // Calculate total amount for this vendor's items
              let vendorOrderAmount = 0;
              vendorItems.forEach(item => {
                const itemTotal = (item.price || 0) * (item.quantity || 0);
                vendorOrderAmount += itemTotal;
              });
              
              // Add handling charge if applicable (proportional to vendor's items)
              if (order.pricing?.handlingCharge && order.pricing?.subtotal && order.pricing.subtotal > 0) {
                const vendorSubtotal = vendorItems.reduce((sum, item) => {
                  return sum + ((item.price || 0) * (item.quantity || 0));
                }, 0);
                const handlingChargeRatio = vendorSubtotal / order.pricing.subtotal;
                const vendorHandlingCharge = (order.pricing.handlingCharge || 0) * handlingChargeRatio;
                vendorOrderAmount += vendorHandlingCharge;
              }
              
              if (vendorOrderAmount > 0) {
                // Update vendor's earning wallet
                const updatedVendor = await Vendor.findOneAndUpdate(
                  { _id: vendorId },
                  {
                    $inc: { earningWallet: vendorOrderAmount },
                    $push: {
                      walletTransactions: {
                        type: 'credit',
                        amount: vendorOrderAmount,
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        description: `Order ${order.orderNumber} delivered. Amount credited to earning wallet.`,
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
                  logger.info(`Order amount ₹${vendorOrderAmount.toFixed(2)} added to vendor ${vendorId} earning wallet for order ${order.orderNumber}`);
                }
              }
            }
          }
        }
      } catch (earningWalletError) {
        logger.error('Error adding order amount to vendor earning wallet:', earningWalletError);
        // Don't fail the request if earning wallet update fails
      }
    } else if (status === 'cancelled' && !order.cancelledAt) {
      order.cancelledAt = new Date();
      order.cancelledBy = 'vendor';
    }

    if (notes !== undefined) {
      order.notes = notes;
    }

    // Update delivery amount if provided
    if (deliveryAmount !== undefined) {
      const deliveryAmountNum = parseFloat(deliveryAmount);
      if (isNaN(deliveryAmountNum) || deliveryAmountNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'Delivery amount must be a valid positive number',
        });
      }
      
      // Save deliveryAmount and riderAmount ONLY in pricing object (not at top level)
      // Ensure pricing object exists
      if (!order.pricing) {
        order.pricing = {};
      }
      
      // Directly assign to pricing object
      order.pricing.deliveryAmount = deliveryAmountNum;
      order.pricing.riderAmount = deliveryAmountNum; // riderAmount is same as deliveryAmount (what rider earns)
      
      // Remove top-level deliveryAmount field if it exists (using set to ensure Mongoose tracks the change)
      if (order.deliveryAmount !== undefined) {
        order.set('deliveryAmount', undefined);
      }
      
      // Update pricing.total = subtotal - discount + tax + handlingCharge + deliveryAmount
      if (order.pricing.subtotal !== undefined && order.pricing.subtotal !== null) {
        const subtotal = order.pricing.subtotal || 0;
        const discount = order.pricing.discount || 0;
        const tax = order.pricing.tax || 0;
        const handlingCharge = order.pricing.handlingCharge || 0;
        const deliveryAmt = deliveryAmountNum;
        
        order.pricing.total = parseFloat((subtotal - discount + tax + handlingCharge + deliveryAmt).toFixed(2));
        
        // Also update payment.amount to match the new total
        if (order.payment) {
          order.payment.amount = order.pricing.total;
        }
      }
      
      // Mark pricing as modified so Mongoose tracks the changes (CRITICAL for nested objects)
      order.markModified('pricing');
      if (order.payment) {
        order.markModified('payment');
      }
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
        logger.error('Error sending notifications to riders:', notifyError);
        // Don't fail the request if notification fails
      }
    }

    // Notify rider about order status update with amount and location
    if (order.rider && ['out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
      try {
        const { notifyRiderOrderUpdate } = require('../utils/socket');
        const orderUpdateData = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: status,
          amount: order.pricing?.total || 0,
          deliveryAmount: order.pricing?.deliveryAmount || order.deliveryAmount || 0,
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
        };
        
        notifyRiderOrderUpdate(order.rider, orderUpdateData);
      } catch (notifyError) {
      }
    }

    // Notify vendor about order status update confirmation via socket
    try {
      const { sendVendorPushNotification } = require('../utils/firebaseNotification');
      
      // Send push notification for important status changes
      if (['ready', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
        const statusMessages = {
          'ready': 'Order is ready for pickup',
          'out_for_delivery': 'Order is out for delivery',
          'delivered': 'Order has been delivered',
          'cancelled': 'Order has been cancelled',
        };
        
        await sendVendorPushNotification(vendorId, {
          type: 'order_status_updated',
          title: 'Order Status Updated',
          message: `Order #${order.orderNumber} status changed to ${status}. ${statusMessages[status] || ''}`,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          status: status,
          data: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: status,
            previousStatus: previousStatus,
          },
        });
      }
    } catch (notifyError) {
      // Don't fail the request if socket notification fails
    }

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
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to assign riders to this order. This order does not contain items from your store.',
      });
    }

    if (!hasVendorItems) {
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
      
      // Add vendor's order amount to earningWallet when order goes out for delivery
      try {
        // Get all unique vendors from order items
        const vendorIds = new Set();
        order.items.forEach(item => {
          const itemVendorId = item.vendor?._id || item.vendor;
          if (itemVendorId) {
            vendorIds.add(itemVendorId.toString());
          }
        });
        
        // Credit amount to each vendor
        for (const vendorIdStr of vendorIds) {
          try {
            const vendor = await Vendor.findById(vendorIdStr);
            if (vendor) {
              // Check if already credited for out_for_delivery status
              const alreadyCredited = vendor.walletTransactions?.some(
                txn => txn.orderId && txn.orderId.toString() === order._id.toString() && 
                       txn.type === 'credit' && 
                       txn.description && txn.description.includes('out for delivery')
              );
              
              if (!alreadyCredited) {
                // Calculate vendor's share from order items
                const vendorItems = order.items.filter(item => {
                  const itemVendorId = item.vendor?._id || item.vendor;
                  return itemVendorId && itemVendorId.toString() === vendorIdStr;
                });
                
                if (vendorItems.length > 0) {
                  // Calculate total amount for this vendor's items
                  let vendorOrderAmount = 0;
                  vendorItems.forEach(item => {
                    // Use totalPrice if available, otherwise calculate from unitPrice/price
                    const itemTotal = item.totalPrice || (item.price || item.unitPrice || 0) * (item.quantity || 0);
                    vendorOrderAmount += itemTotal;
                  });
                  
                  // Add handling charge if applicable (proportional to vendor's items)
                  if (order.pricing?.handlingCharge && order.pricing?.subtotal && order.pricing.subtotal > 0) {
                    const vendorSubtotal = vendorItems.reduce((sum, item) => {
                      const itemTotal = item.totalPrice || (item.price || item.unitPrice || 0) * (item.quantity || 0);
                      return sum + itemTotal;
                    }, 0);
                    const handlingChargeRatio = vendorSubtotal / order.pricing.subtotal;
                    const vendorHandlingCharge = (order.pricing.handlingCharge || 0) * handlingChargeRatio;
                    vendorOrderAmount += vendorHandlingCharge;
                  }
                  
                  if (vendorOrderAmount > 0) {
                    // Update vendor's earning wallet
                    const updatedVendor = await Vendor.findOneAndUpdate(
                      { _id: vendorIdStr },
                      {
                        $inc: { earningWallet: vendorOrderAmount },
                        $push: {
                          walletTransactions: {
                            type: 'credit',
                            amount: vendorOrderAmount,
                            orderId: order._id,
                            orderNumber: order.orderNumber,
                            description: `Order ${order.orderNumber} out for delivery. Amount credited to earning wallet.`,
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
                      logger.info(`Order amount ₹${vendorOrderAmount.toFixed(2)} added to vendor ${vendorIdStr} earning wallet for order ${order.orderNumber} (out for delivery via rider assignment)`);
                    }
                  }
                }
              }
            }
          } catch (vendorError) {
            logger.error(`Error crediting vendor ${vendorIdStr} for order ${order.orderNumber}:`, vendorError);
            // Continue with other vendors even if one fails
          }
        }
      } catch (earningWalletError) {
        logger.error('Error adding order amount to vendor earning wallet (out for delivery):', earningWalletError);
        // Don't fail the request if earning wallet update fails
      }
    }

    await order.save();

    // Notify vendor via socket about rider assignment
    try {
      const { sendVendorPushNotification } = require('../utils/firebaseNotification');
      const vendorId = req.vendor._id;
      
      // Send push notification
      await sendVendorPushNotification(vendorId, {
        type: 'rider_assigned',
        title: 'Rider Assigned to Order',
        message: `Rider ${rider.fullName || rider.mobileNumber} has been assigned to order #${order.orderNumber}`,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          riderId: rider._id.toString(),
          riderName: rider.fullName,
          riderMobile: rider.mobileNumber,
          status: order.status,
        },
      });
    } catch (notifyError) {
      // Don't fail the request if push notification fails
      logger.error('Error sending push notification to vendor for rider assignment:', notifyError);
    }

    const populatedOrder = await Order.findById(orderId)
      .populate('user', 'name email contactNumber')
      .populate('items.product', 'productName description')
      .populate('items.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber')
      .populate('assignedBy', 'vendorName storeName contactNumber');

    res.status(200).json({
      success: true,
      message: 'Rider assigned to order successfully',
      data: populatedOrder,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.getVendorProfile = async (req, res, next) => {
  try {
    // Get vendor from authenticated request
    const vendor = await Vendor.findById(req.vendor._id).populate('createdBy', 'name email');

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
    next(error);
  }
};

exports.updateVendorProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Get vendor from authenticated request
    const vendor = req.vendor;

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

    // Prevent contactNumber from being updated
    if (req.body.contactNumber !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Contact number cannot be updated through this endpoint',
      });
    }

    // Prevent permissions from being updated by vendor
    if (req.body.permissions !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Permissions cannot be updated through this endpoint',
      });
    }

    // Prevent document files from being updated
    const documentFields = [
      'panCardFront', 'panCardBack', 
      'aadharCardFront', 'aadharCardBack', 
      'drivingLicense', 'cancelCheque'
    ];
    
    const hasDocumentFiles = documentFields.some(field => {
      if (!req.files) return false;
      // Check various possible field name variations
      return req.files[field] || 
             req.files[`${field} `] || 
             req.files[` ${field}`] ||
             req.files[`${field}[]`] ||
             req.files[`${field}[] `] ||
             req.files[` ${field}[]`];
    });

    if (hasDocumentFiles) {
      return res.status(400).json({
        success: false,
        error: 'Documents cannot be updated through this endpoint. Please contact admin for document updates.',
      });
    }

    // Filter out document files from req.files before passing to updateVendorData
    // Only allow storeImage and profileImage to be updated
    const filteredFiles = {};
    if (req.files) {
      // Allow storeImage
      const storeImageVariations = [
        'storeImage', 'storeImage ', ' storeImage',
        'storeImage[]', 'storeImage[] ', ' storeImage[]'
      ];
      
      for (const variation of storeImageVariations) {
        if (req.files[variation]) {
          filteredFiles.storeImage = req.files[variation];
          break;
        }
      }

      // Allow profileImage
      const profileImageVariations = [
        'profileImage', 'profileImage ', ' profileImage',
        'profileImage[]', 'profileImage[] ', ' profileImage[]'
      ];
      
      for (const variation of profileImageVariations) {
        if (req.files[variation]) {
          filteredFiles.profileImage = req.files[variation];
          break;
        }
      }
    }

    // Check if email is being updated and if it already exists
    if (req.body.email && req.body.email !== vendor.email) {
      const existingEmail = await Vendor.findOne({ 
        email: req.body.email, 
        _id: { $ne: vendor._id } 
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists',
        });
      }
    }

    // Use updateVendorData service to update vendor (with filtered files - only storeImage allowed)
    await updateVendorData(vendor, req.body, Object.keys(filteredFiles).length > 0 ? filteredFiles : null);

    await vendor.save();

    const populatedVendor = await Vendor.findById(vendor._id).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Vendor profile updated successfully',
      data: populatedVendor,
    });
  } catch (error) {
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

/**
 * Get vendor dashboard data for admin (vendor-wise)
 * Returns comprehensive vendor information including store details, orders, metrics, riders, and invoices
 */
exports.getVendorDashboardForAdmin = async (req, res, next) => {
  try {
    const vendorId = req.params.id;
    
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor ID is required',
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendor ID format',
      });
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    // Get vendor details - ensure all fields including walletTransactions are included
    const vendorDoc = await Vendor.findById(vendorObjectId)
      .populate('createdBy', 'name email');
    
    if (!vendorDoc) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }
    
    // Convert to plain object to avoid mongoose document serialization issues
    const vendor = vendorDoc.toObject ? vendorDoc.toObject() : vendorDoc;

    // Get all orders for this vendor
    const allOrders = await Order.find({ 'items.vendor': vendorObjectId });
    
    // Calculate order status distribution
    const statusCounts = {
      completed: 0,
      in_progress: 0,
      pending: 0,
      cancelled: 0,
    };
    
    allOrders.forEach(order => {
      const status = order.status;
      if (status === 'delivered') {
        statusCounts.completed++;
      } else if (['processing', 'ready', 'out_for_delivery', 'confirmed'].includes(status)) {
        statusCounts.in_progress++;
      } else if (status === 'pending') {
        statusCounts.pending++;
      } else if (['cancelled', 'refunded'].includes(status)) {
        statusCounts.cancelled++;
      }
    });

    const totalOrders = allOrders.length;
    const orderStatusDistribution = totalOrders > 0 ? {
      completed: {
        count: statusCounts.completed,
        percentage: Math.round((statusCounts.completed / totalOrders) * 100),
      },
      in_progress: {
        count: statusCounts.in_progress,
        percentage: Math.round((statusCounts.in_progress / totalOrders) * 100),
      },
      pending: {
        count: statusCounts.pending,
        percentage: Math.round((statusCounts.pending / totalOrders) * 100),
      },
      cancelled: {
        count: statusCounts.cancelled,
        percentage: Math.round((statusCounts.cancelled / totalOrders) * 100),
      },
      total: totalOrders,
    } : {
      completed: { count: 0, percentage: 0 },
      in_progress: { count: 0, percentage: 0 },
      pending: { count: 0, percentage: 0 },
      cancelled: { count: 0, percentage: 0 },
      total: 0,
    };

    // Get products statistics
    const totalProducts = await Product.countDocuments({ vendor: vendorObjectId });
    const publishedProducts = await Product.countDocuments({ 
      vendor: vendorObjectId, 
      approvalStatus: 'approved',
      isActive: true 
    });
    const productsInReview = await Product.countDocuments({ 
      vendor: vendorObjectId, 
      approvalStatus: 'pending' 
    });

    // Get category and subcategory usage
    const categoryUsage = await Product.distinct('category', { vendor: vendorObjectId });
    const subCategoryUsage = await Product.distinct('subCategory', { vendor: vendorObjectId });

    // Get order statistics
    const totalDeliveredOrders = await Order.countDocuments({ 
      'items.vendor': vendorObjectId,
      status: 'delivered'
    });
    const totalCancelledOrders = await Order.countDocuments({ 
      'items.vendor': vendorObjectId,
      status: { $in: ['cancelled', 'refunded'] }
    });

    // Calculate total revenue
    const revenueData = await Order.aggregate([
      { $match: { 'items.vendor': vendorObjectId, status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorObjectId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$items.totalPrice' },
        },
      },
    ]);
    const totalRevenue = revenueData[0]?.totalRevenue || 0;

    // Get inventory count
    const inventoryData = await Product.aggregate([
      { $match: { vendor: vendorObjectId, isActive: true } },
      {
        $group: {
          _id: null,
          totalInventory: { $sum: '$inventory' },
        },
      },
    ]);
    const totalInventory = inventoryData[0]?.totalInventory || 0;

    // Get ratings (if available - placeholder for now)
    const ratings = 0; // This would need a ratings model

    // Get ticket count
    const ticketCount = await Ticket.countDocuments({ vendor: vendorObjectId });

    // Get riders assigned to this vendor
    const riders = await Rider.find({ vendor: vendorObjectId })
      .select('fullName mobileNumber approvalStatus isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const deliveryPartners = riders.map(rider => {
      let status = 'In Active';
      let statusColor = 'red';
      
      if (rider.approvalStatus === 'approved' && rider.isActive) {
        status = 'Online';
        statusColor = 'blue';
      } else if (rider.approvalStatus === 'approved' && !rider.isActive) {
        status = 'In Active';
        statusColor = 'red';
      } else if (rider.approvalStatus === 'pending') {
        status = 'Pending';
        statusColor = 'yellow';
      }

      return {
        id: rider._id ? rider._id.toString() : null,
        name: rider.fullName || 'Unknown',
        mobileNumber: rider.mobileNumber || null,
        status: status,
        statusColor: statusColor,
        joinedDate: rider.createdAt || null,
      };
    });

    // Get recent invoices
    const recentInvoices = await Invoice.find({ vendor: vendorObjectId })
      .populate('user', 'fullName')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const invoices = recentInvoices.map(invoice => ({
      id: invoice._id ? invoice._id.toString() : null,
      invoiceNumber: invoice.invoiceNumber || null,
      orderNumber: invoice.orderNumber || null,
      customerName: invoice.user?.fullName || 'Unknown',
      amount: invoice.amount || 0,
      status: invoice.status || null,
      date: invoice.date || null,
    }));

    // Get recent orders (for order list)
    const recentOrders = await Order.find({ 'items.vendor': vendorObjectId })
      .populate('user', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const orderList = recentOrders.map(order => ({
      id: order._id ? order._id.toString() : null,
      orderNumber: order.orderNumber || null,
      customerName: order.user?.fullName || 'Unknown',
      status: order.status || null,
      total: order.pricing?.total || 0,
      createdAt: order.createdAt || null,
    }));

    // Get wallet information - ensure proper defaults
    // Access vendor properties - mongoose documents support direct property access
    const earningWalletValue = vendor.earningWallet;
    const earningWallet = (earningWalletValue !== undefined && earningWalletValue !== null) 
      ? Number(earningWalletValue) 
      : 0;
    
    const walletTransactionsValue = vendor.walletTransactions;
    const walletTransactions = Array.isArray(walletTransactionsValue) 
      ? walletTransactionsValue 
      : (walletTransactionsValue ? [walletTransactionsValue] : []);
    
    // Get recent wallet transactions (last 10)
    const recentWalletTransactions = walletTransactions.length > 0
      ? walletTransactions
          .filter(t => t && (t.createdAt || t._id)) // Filter out invalid transactions
          .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
          })
          .slice(0, 10)
          .map(transaction => ({
            id: transaction._id ? transaction._id.toString() : null,
            type: transaction.type || 'credit', // 'credit', 'debit', 'reset'
            amount: transaction.amount || 0,
            orderId: transaction.orderId ? (typeof transaction.orderId === 'object' && transaction.orderId.toString ? transaction.orderId.toString() : String(transaction.orderId)) : null,
            orderNumber: transaction.orderNumber || null,
            description: transaction.description || '',
            createdAt: transaction.createdAt || new Date(),
          }))
      : [];

    // Format date of birth
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    // Build response with all vendor details including bank details
    const dashboardData = {
      // Complete vendor information
      vendor: {
        id: vendor._id ? vendor._id.toString() : null,
        vendorName: vendor.vendorName || null,
        contactNumber: vendor.contactNumber || null,
        contactNumberVerified: vendor.contactNumberVerified || false,
        altContactNumber: vendor.altContactNumber || null,
        email: vendor.email || null,
        gender: vendor.gender || null,
        dateOfBirth: vendor.dateOfBirth ? formatDate(vendor.dateOfBirth) : null,
        age: vendor.age || null,
        profileImage: vendor.profileImage || null,
        storeId: vendor.storeId || null,
        storeName: vendor.storeName || null,
        storeImage: vendor.storeImage || [],
        storeAddress: {
          line1: vendor.storeAddress?.line1 || null,
          line2: vendor.storeAddress?.line2 || null,
          pinCode: vendor.storeAddress?.pinCode || null,
          city: vendor.storeAddress?.city || null,
          state: vendor.storeAddress?.state || null,
          latitude: vendor.storeAddress?.latitude || null,
          longitude: vendor.storeAddress?.longitude || null,
        },
        // Bank details (band details as mentioned by user)
        bankDetails: {
          ifsc: vendor.bankDetails?.ifsc || null,
          accountNumber: vendor.bankDetails?.accountNumber || null,
          bankName: vendor.bankDetails?.bankName || null,
          cancelCheque: vendor.bankDetails?.cancelCheque || null,
        },
        // Documents
        documents: {
          panCardFront: vendor.documents?.panCardFront || null,
          panCardBack: vendor.documents?.panCardBack || null,
          aadharCardFront: vendor.documents?.aadharCardFront || null,
          aadharCardBack: vendor.documents?.aadharCardBack || null,
          drivingLicense: vendor.documents?.drivingLicense || null,
        },
        // Permissions
        permissions: {
          canManageProducts: vendor.permissions?.canManageProducts || false,
          canManageOrders: vendor.permissions?.canManageOrders || false,
          canManageInventory: vendor.permissions?.canManageInventory || false,
          canViewAnalytics: vendor.permissions?.canViewAnalytics || false,
          canManageDiscounts: vendor.permissions?.canManageDiscounts || false,
          canManagePromotions: vendor.permissions?.canManagePromotions || false,
          canExportData: vendor.permissions?.canExportData || false,
          canManageReviews: vendor.permissions?.canManageReviews || false,
        },
        fssaiNumber: vendor.fssaiNumber || null,
        serviceRadius: vendor.serviceRadius || null,
        handlingChargePercentage: vendor.handlingChargePercentage || null,
        commission: vendor.commission ? {
          type: vendor.commission.type || 'percentage',
          percentage: vendor.commission.percentage || 10,
          fixedAmount: vendor.commission.fixedAmount || 0,
          subscriptionAmount: vendor.commission.subscriptionAmount || 0,
          subscriptionPeriod: vendor.commission.subscriptionPeriod || 'monthly',
          updatedBy: vendor.commission.updatedBy || null,
          updatedAt: vendor.commission.updatedAt || null,
        } : {
          type: 'percentage',
          percentage: 10,
          fixedAmount: 0,
          subscriptionAmount: 0,
          subscriptionPeriod: 'monthly',
          updatedBy: null,
          updatedAt: null,
        },
        isActive: vendor.isActive !== undefined ? vendor.isActive : true,
        createdBy: vendor.createdBy ? {
          _id: vendor.createdBy._id ? vendor.createdBy._id.toString() : null,
          name: vendor.createdBy.name || null,
          email: vendor.createdBy.email || null,
        } : null,
        createdAt: vendor.createdAt || null,
        updatedAt: vendor.updatedAt || null,
      },
      storeInfo: {
        storeId: vendor.storeId,
        storeName: vendor.storeName,
        storeImage: vendor.storeImage || [],
        performance: 99, // Placeholder - can be calculated based on orders/ratings
      },
      storeDetails: {
        latitude: vendor.storeAddress?.latitude || null,
        longitude: vendor.storeAddress?.longitude || null,
        authorizedPerson: vendor.vendorName || 'N/A',
        contact: vendor.contactNumber || 'N/A',
        altContact: vendor.altContactNumber || 'N/A',
        email: vendor.email || 'N/A',
        dateOfBirth: vendor.dateOfBirth ? formatDate(vendor.dateOfBirth) : 'N/A',
        gender: vendor.gender ? vendor.gender.charAt(0).toUpperCase() + vendor.gender.slice(1) : 'N/A',
      },
      storeAddress: {
        addressLine1: vendor.storeAddress?.line1 || '',
        addressLine2: vendor.storeAddress?.line2 || '',
        city: vendor.storeAddress?.city || '',
        state: vendor.storeAddress?.state || '',
        pinCode: vendor.storeAddress?.pinCode || '',
      },
      orderOverview: {
        totalAttendance: totalOrders,
        totalOrders: totalOrders,
        statusDistribution: {
          completed: {
            count: orderStatusDistribution.completed.count,
            percentage: orderStatusDistribution.completed.percentage,
          },
          in_progress: {
            count: orderStatusDistribution.in_progress.count,
            percentage: orderStatusDistribution.in_progress.percentage,
          },
          pending: {
            count: orderStatusDistribution.pending.count,
            percentage: orderStatusDistribution.pending.percentage,
          },
          cancelled: {
            count: orderStatusDistribution.cancelled.count,
            percentage: orderStatusDistribution.cancelled.percentage,
          },
        },
        orderList: orderList,
      },
      metrics: {
        categoryUse: Array.isArray(categoryUsage) ? categoryUsage.length : 0,
        subCategoryUse: Array.isArray(subCategoryUsage) ? subCategoryUsage.length : 0,
        totalProducts: totalProducts || 0,
        productPublished: publishedProducts || 0,
        productInReview: productsInReview || 0,
        totalOrder: totalOrders || 0,
        totalDeliveredOrder: totalDeliveredOrders || 0,
        totalCanceledOrder: totalCancelledOrders || 0,
        totalRiders: Array.isArray(riders) ? riders.length : 0,
        ratings: ratings || 0,
        inventory: totalInventory || 0,
        amount: totalRevenue || 0,
        ticket: ticketCount || 0,
      },
      wallet: {
        earningWallet: Number(earningWallet) || 0,
        formattedEarningWallet: `₹${(Number(earningWallet) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        totalTransactions: Array.isArray(walletTransactions) ? walletTransactions.length : 0,
        recentTransactions: Array.isArray(recentWalletTransactions) ? recentWalletTransactions : [],
      },
      deliveryPartners: Array.isArray(deliveryPartners) ? deliveryPartners : [],
      invoices: Array.isArray(invoices) ? invoices : [],
    };

    // Log for debugging (remove in production)
    logger.debug('Dashboard data structure:', {
      hasVendor: !!dashboardData.vendor,
      hasWallet: !!dashboardData.wallet,
      hasMetrics: !!dashboardData.metrics,
      walletKeys: dashboardData.wallet ? Object.keys(dashboardData.wallet) : [],
      metricsKeys: dashboardData.metrics ? Object.keys(dashboardData.metrics) : [],
    });

    // Ensure dashboardData is a plain object, not a mongoose document
    // Convert to JSON and back to ensure all mongoose documents are serialized
    const responseData = JSON.parse(JSON.stringify(dashboardData));

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request withdrawal from vendor's earningWallet
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

    const vendorId = req.vendor._id;
    const { amount, description } = req.body;

    // Validate amount
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid positive number',
      });
    }

    // Find the vendor
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    // Check if vendor has sufficient balance
    const currentBalance = vendor.earningWallet || 0;
    if (transferAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Your current earning wallet balance is ₹${currentBalance.toFixed(2)}. You cannot request ₹${transferAmount.toFixed(2)}`,
        currentBalance: currentBalance.toFixed(2),
        requestedAmount: transferAmount.toFixed(2),
      });
    }

    // Create withdrawal request
    const withdrawalRequest = await VendorEarningWalletWithdrawal.create({
      vendor: vendorId,
      amount: transferAmount,
      description: description || `Withdrawal request for ₹${transferAmount.toFixed(2)}`,
      status: 'pending',
      currentBalance: currentBalance,
      requestedAt: new Date(),
    });

    logger.info(`Vendor ${vendorId} created withdrawal request for ₹${transferAmount.toFixed(2)}. Request ID: ${withdrawalRequest._id}`);

    res.status(200).json({
      success: true,
      message: `Withdrawal request of ₹${transferAmount.toFixed(2)} submitted successfully. It will be processed after admin approval.`,
      data: {
        requestId: withdrawalRequest._id,
        vendor: {
          vendorId: vendor._id,
          vendorName: vendor.vendorName,
          storeName: vendor.storeName,
          contactNumber: vendor.contactNumber,
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
    logger.error('Create vendor earning wallet withdrawal request error:', error);
    next(error);
  }
};

/**
 * Get vendor's own withdrawal requests
 */
exports.getMyWithdrawalRequests = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { vendor: vendorId };

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Get vendor's current earning wallet balance
    const vendor = await Vendor.findById(vendorId).select('earningWallet');
    const currentEarningWallet = vendor ? (vendor.earningWallet || 0) : 0;

    // Get withdrawal requests
    const withdrawalRequests = await VendorEarningWalletWithdrawal.find(query)
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await VendorEarningWalletWithdrawal.countDocuments(query);

    res.status(200).json({
      success: true,
      count: withdrawalRequests.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      earningWallet: {
        currentBalance: currentEarningWallet.toFixed(2),
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
    logger.error('Get my vendor withdrawal requests error:', error);
    next(error);
  }
};

/**
 * Get all vendor withdrawal requests (Admin only)
 */
exports.getVendorWithdrawalRequests = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by vendor
    if (req.query.vendorId) {
      query.vendor = req.query.vendorId;
    }

    // Get withdrawal requests with vendor details
    const withdrawalRequests = await VendorEarningWalletWithdrawal.find(query)
      .populate('vendor', 'vendorName storeName contactNumber earningWallet')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await VendorEarningWalletWithdrawal.countDocuments(query);

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
        vendor: {
          vendorId: request.vendor?._id || request.vendor,
          vendorName: request.vendor?.vendorName,
          storeName: request.vendor?.storeName,
          contactNumber: request.vendor?.contactNumber,
          currentEarningWallet: (request.vendor?.earningWallet || 0).toFixed(2),
        },
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
    logger.error('Get vendor withdrawal requests error:', error);
    next(error);
  }
};

/**
 * Approve vendor withdrawal request (Admin only)
 */
exports.approveVendorWithdrawalRequest = async (req, res, next) => {
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
    const withdrawalRequest = await VendorEarningWalletWithdrawal.findById(requestId)
      .populate('vendor', 'vendorName storeName contactNumber earningWallet');

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

    const vendor = withdrawalRequest.vendor;
    const currentBalance = vendor.earningWallet || 0;
    const withdrawalAmount = withdrawalRequest.amount;

    // Double check balance
    if (withdrawalAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        error: `Cannot approve. Vendor's current balance (₹${currentBalance.toFixed(2)}) is less than requested amount (₹${withdrawalAmount.toFixed(2)})`,
        vendorBalance: currentBalance.toFixed(2),
        requestedAmount: withdrawalAmount.toFixed(2),
      });
    }

    // Calculate new balance
    const newBalance = currentBalance - withdrawalAmount;

    // Use atomic update to deduct amount and create transaction
    const updatedVendor = await Vendor.findOneAndUpdate(
      { _id: vendor._id },
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

    if (!updatedVendor) {
      return res.status(404).json({
        success: false,
        error: 'Failed to update vendor wallet',
      });
    }

    // Update withdrawal request status
    withdrawalRequest.status = 'approved';
    withdrawalRequest.approvedBy = adminId;
    withdrawalRequest.approvedAt = new Date();
    withdrawalRequest.transactionId = updatedVendor._id;
    await withdrawalRequest.save();

    logger.info(`Admin ${adminId} approved vendor withdrawal request ${requestId} for vendor ${vendor._id}. Amount: ₹${withdrawalAmount.toFixed(2)}`);

    res.status(200).json({
      success: true,
      message: `Withdrawal request approved successfully. Amount ₹${withdrawalAmount.toFixed(2)} deducted from vendor's earning wallet`,
      data: {
        requestId: withdrawalRequest._id,
        vendor: {
          vendorId: vendor._id,
          vendorName: vendor.vendorName,
          storeName: vendor.storeName,
          contactNumber: vendor.contactNumber,
        },
        withdrawal: {
          amount: withdrawalAmount.toFixed(2),
          previousBalance: currentBalance.toFixed(2),
          newBalance: updatedVendor.earningWallet.toFixed(2),
          status: 'approved',
          approvedBy: adminId,
          approvedAt: withdrawalRequest.approvedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Approve vendor withdrawal request error:', error);
    next(error);
  }
};

/**
 * Reject vendor withdrawal request (Admin only)
 */
exports.rejectVendorWithdrawalRequest = async (req, res, next) => {
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
    const withdrawalRequest = await VendorEarningWalletWithdrawal.findById(requestId)
      .populate('vendor', 'vendorName storeName contactNumber');

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

    logger.info(`Admin ${adminId} rejected vendor withdrawal request ${requestId} for vendor ${withdrawalRequest.vendor._id}`);

    res.status(200).json({
      success: true,
      message: 'Withdrawal request rejected successfully',
      data: {
        requestId: withdrawalRequest._id,
        vendor: {
          vendorId: withdrawalRequest.vendor._id,
          vendorName: withdrawalRequest.vendor.vendorName,
          storeName: withdrawalRequest.vendor.storeName,
          contactNumber: withdrawalRequest.vendor.contactNumber,
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
    logger.error('Reject vendor withdrawal request error:', error);
    next(error);
  }
};

/**
 * Get vendor commission settings
 * GET /api/vendor/:id/commission
 */
exports.getVendorCommission = async (req, res, next) => {
  try {
    const vendorId = req.params.id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor ID is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendor ID format',
      });
    }

    const vendor = await Vendor.findById(vendorId).select('commission vendorName storeName');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    // Default commission if not set
    const commission = vendor.commission || {
      type: 'percentage',
      percentage: 10,
      fixedAmount: 0,
      subscriptionAmount: 0,
      subscriptionPeriod: 'monthly',
    };

    res.status(200).json({
      success: true,
      data: {
        vendorId: vendor._id,
        vendorName: vendor.vendorName,
        storeName: vendor.storeName,
        commission: {
          type: commission.type || 'percentage',
          percentage: commission.percentage || 10,
          fixedAmount: commission.fixedAmount || 0,
          subscriptionAmount: commission.subscriptionAmount || 0,
          subscriptionPeriod: commission.subscriptionPeriod || 'monthly',
          updatedBy: commission.updatedBy || null,
          updatedAt: commission.updatedAt || null,
        },
      },
    });
  } catch (error) {
    logger.error('Get vendor commission error:', error);
    next(error);
  }
};

/**
 * Update vendor commission settings
 * PUT /api/vendor/:id/commission
 */
exports.updateVendorCommission = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.params.id;
    const { type, percentage, fixedAmount, subscriptionAmount, subscriptionPeriod } = req.body;
    const adminId = req.admin._id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor ID is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendor ID format',
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
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
    if (!vendor.commission) {
      vendor.commission = {
        type: 'percentage',
        percentage: 10,
        fixedAmount: 0,
        subscriptionAmount: 0,
        subscriptionPeriod: 'monthly',
      };
    }

    // Update commission fields
    if (type !== undefined) {
      vendor.commission.type = type;
    }

    if (percentage !== undefined) {
      const percentageValue = parseFloat(percentage);
      if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
        return res.status(400).json({
          success: false,
          error: 'Commission percentage must be between 0 and 100',
        });
      }
      vendor.commission.percentage = percentageValue;
    }

    if (fixedAmount !== undefined) {
      const fixedValue = parseFloat(fixedAmount);
      if (isNaN(fixedValue) || fixedValue < 0) {
        return res.status(400).json({
          success: false,
          error: 'Fixed commission amount must be greater than or equal to 0',
        });
      }
      vendor.commission.fixedAmount = fixedValue;
    }

    if (subscriptionAmount !== undefined) {
      const subscriptionValue = parseFloat(subscriptionAmount);
      if (isNaN(subscriptionValue) || subscriptionValue < 0) {
        return res.status(400).json({
          success: false,
          error: 'Subscription amount must be greater than or equal to 0',
        });
      }
      vendor.commission.subscriptionAmount = subscriptionValue;
    }

    if (subscriptionPeriod !== undefined) {
      if (!['monthly', 'yearly'].includes(subscriptionPeriod)) {
        return res.status(400).json({
          success: false,
          error: 'Subscription period must be either "monthly" or "yearly"',
        });
      }
      vendor.commission.subscriptionPeriod = subscriptionPeriod;
    }

    // Update metadata
    vendor.commission.updatedBy = adminId;
    vendor.commission.updatedAt = new Date();

    await vendor.save();

    const populatedVendor = await Vendor.findById(vendor._id)
      .populate('commission.updatedBy', 'name email')
      .select('commission vendorName storeName');

    logger.info(`Admin ${adminId} updated commission for vendor ${vendorId}`);

    res.status(200).json({
      success: true,
      message: 'Vendor commission updated successfully',
      data: {
        vendorId: populatedVendor._id,
        vendorName: populatedVendor.vendorName,
        storeName: populatedVendor.storeName,
        commission: {
          type: populatedVendor.commission.type,
          percentage: populatedVendor.commission.percentage,
          fixedAmount: populatedVendor.commission.fixedAmount,
          subscriptionAmount: populatedVendor.commission.subscriptionAmount,
          subscriptionPeriod: populatedVendor.commission.subscriptionPeriod,
          updatedBy: populatedVendor.commission.updatedBy || null,
          updatedAt: populatedVendor.commission.updatedAt,
        },
      },
    });
  } catch (error) {
    logger.error('Update vendor commission error:', error);
    next(error);
  }
};
