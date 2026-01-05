const Vendor = require('../models/Vendor');
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
