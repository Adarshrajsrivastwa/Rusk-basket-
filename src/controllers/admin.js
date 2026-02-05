const Admin = require('../models/Admin');
const { validationResult } = require('express-validator');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');

/**
 * Get admin profile
 * Returns the authenticated admin's profile information
 */
exports.getAdminProfile = async (req, res, next) => {
  try {
    // Get admin from authenticated request
    const admin = await Admin.findById(req.admin._id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update admin profile
 * Allows updating business information fields
 */
exports.updateAdminProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Get admin from authenticated request
    const admin = req.admin;

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }

    // Update name if provided
    if (req.body.name !== undefined) {
      admin.name = req.body.name.trim();
    }

    // Prevent mobile and email from being updated through this endpoint
    if (req.body.mobile !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Mobile number cannot be updated through this endpoint',
      });
    }

    if (req.body.email !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Email cannot be updated through this endpoint',
      });
    }

    // Handle company logo upload
    if (req.files && req.files.companyLogo) {
      try {
        // Delete old logo if exists
        if (admin.companyLogo) {
          try {
            // Extract public_id from URL if it's a Cloudinary URL
            const urlParts = admin.companyLogo.split('/');
            const publicIdWithExt = urlParts[urlParts.length - 1];
            const publicId = publicIdWithExt.split('.')[0];
            const folder = 'rush-basket/admin';
            const fullPublicId = `${folder}/${publicId}`;
            await deleteFromCloudinary(fullPublicId);
          } catch (deleteError) {
            logger.error('Error deleting old company logo:', deleteError);
            // Continue even if deletion fails
          }
        }

        // Upload new logo
        const logoFile = Array.isArray(req.files.companyLogo) 
          ? req.files.companyLogo[0] 
          : req.files.companyLogo;
        
        const logoResult = await uploadToCloudinary(logoFile, 'rush-basket/admin');
        admin.companyLogo = logoResult.url;
      } catch (uploadError) {
        logger.error('Error uploading company logo:', uploadError);
        return res.status(400).json({
          success: false,
          error: 'Failed to upload company logo',
        });
      }
    }

    // Update basic information
    const basicInfoFields = ['companyName', 'legalName'];
    basicInfoFields.forEach(field => {
      if (req.body[field] !== undefined) {
        admin[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    // Update contact details
    const contactFields = ['website', 'alternatePhone', 'contactPerson', 'designation'];
    contactFields.forEach(field => {
      if (req.body[field] !== undefined) {
        admin[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    // Update banking information
    const bankingFields = ['bankName', 'branchName', 'accountNumber', 'ifscCode'];
    bankingFields.forEach(field => {
      if (req.body[field] !== undefined) {
        admin[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    // Update legal & registration details
    if (req.body.foundedYear !== undefined) {
      admin.foundedYear = parseInt(req.body.foundedYear);
    }
    const legalFields = ['registrationNumber', 'gstNumber', 'panNumber'];
    legalFields.forEach(field => {
      if (req.body[field] !== undefined) {
        admin[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });

    // Vision & Mission cannot be updated through this endpoint
    if (req.body.vision !== undefined || req.body.mission !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Vision and Mission cannot be updated through this endpoint',
      });
    }

    // Update office address
    if (req.body.officeAddress !== undefined) {
      if (typeof req.body.officeAddress === 'object') {
        if (req.body.officeAddress.streetAddress !== undefined) {
          admin.officeAddress.streetAddress = req.body.officeAddress.streetAddress;
        }
        if (req.body.officeAddress.city !== undefined) {
          admin.officeAddress.city = req.body.officeAddress.city;
        }
        if (req.body.officeAddress.state !== undefined) {
          admin.officeAddress.state = req.body.officeAddress.state;
        }
        if (req.body.officeAddress.pincode !== undefined) {
          admin.officeAddress.pincode = req.body.officeAddress.pincode;
        }
        if (req.body.officeAddress.country !== undefined) {
          admin.officeAddress.country = req.body.officeAddress.country;
        }
        if (req.body.officeAddress.latitude !== undefined) {
          admin.officeAddress.latitude = req.body.officeAddress.latitude;
        }
        if (req.body.officeAddress.longitude !== undefined) {
          admin.officeAddress.longitude = req.body.officeAddress.longitude;
        }
      }
    }

    // Update individual office address fields if provided directly
    const addressFields = ['streetAddress', 'city', 'state', 'pincode', 'country'];
    addressFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (!admin.officeAddress) {
          admin.officeAddress = {};
        }
        admin.officeAddress[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    });
    
    // Handle latitude and longitude separately (they are numbers)
    if (req.body.latitude !== undefined) {
      if (!admin.officeAddress) {
        admin.officeAddress = {};
      }
      admin.officeAddress.latitude = parseFloat(req.body.latitude);
    }
    if (req.body.longitude !== undefined) {
      if (!admin.officeAddress) {
        admin.officeAddress = {};
      }
      admin.officeAddress.longitude = parseFloat(req.body.longitude);
    }

    // Verification status cannot be updated through this endpoint
    if (req.body.emailVerified !== undefined || req.body.phoneVerified !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Verification status cannot be updated through this endpoint',
      });
    }

    // Update key metrics (supports both nested object and flat format)
    const keyMetricsFields = ['yearsInBusiness', 'totalEmployees', 'activeClients', 'totalLeads'];
    
    // Handle nested keyMetrics object
    if (req.body.keyMetrics !== undefined && typeof req.body.keyMetrics === 'object') {
      if (!admin.keyMetrics) {
        admin.keyMetrics = {};
      }
      keyMetricsFields.forEach(field => {
        if (req.body.keyMetrics[field] !== undefined) {
          admin.keyMetrics[field] = parseInt(req.body.keyMetrics[field]);
        }
      });
    }
    
    // Handle individual key metrics fields (flat format)
    keyMetricsFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (!admin.keyMetrics) {
          admin.keyMetrics = {};
        }
        admin.keyMetrics[field] = parseInt(req.body[field]);
      }
    });

    // Save the updated admin
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully',
      data: admin,
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
