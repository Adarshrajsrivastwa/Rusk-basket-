const SubCategory = require('../models/SubCategory');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// Haversine formula to calculate distance between two coordinates in kilometers
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

exports.createSubCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description, category } = req.body;

    const parentCategory = await Category.findById(category);
    if (!parentCategory) {
      return res.status(404).json({
        success: false,
        error: 'Parent category not found',
      });
    }

    const existingSubCategory = await SubCategory.findOne({ name, category });
    if (existingSubCategory) {
      return res.status(400).json({
        success: false,
        error: 'SubCategory with this name already exists in this category',
      });
    }

    let imageData = {};

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/subcategories');
        imageData = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    const subCategory = await SubCategory.create({
      name,
      description,
      category,
      image: imageData.url ? imageData : undefined,
      createdBy: req.admin._id,
    });

    // Increment subCategoryCount in the parent category
    await Category.findByIdAndUpdate(category, {
      $inc: { subCategoryCount: 1 },
    });

    const populatedSubCategory = await SubCategory.findById(subCategory._id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    logger.info(`SubCategory created: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(201).json({
      success: true,
      message: 'SubCategory created successfully',
      data: populatedSubCategory,
    });
  } catch (error) {
    logger.error('Create subcategory error:', error);
    next(error);
  }
};

exports.getSubCategories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.isActive;
    const category = req.query.category;

    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (category) {
      query.category = category;
    }

    const subCategories = await SubCategory.find(query)
      .populate('category', 'name')
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await SubCategory.countDocuments(query);

    res.status(200).json({
      success: true,
      count: subCategories.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: subCategories,
    });
  } catch (error) {
    logger.error('Get subcategories error:', error);
    next(error);
  }
};

exports.getSubCategory = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    res.status(200).json({
      success: true,
      data: subCategory,
    });
  } catch (error) {
    logger.error('Get subcategory error:', error);
    next(error);
  }
};

exports.updateSubCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    let subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    const { name, description, category } = req.body;

    // Store the old category ID before any updates
    const oldCategoryId = subCategory.category;

    if (category) {
      const parentCategory = await Category.findById(category);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          error: 'Parent category not found',
        });
      }
    }

    if (name && (name !== subCategory.name || category !== subCategory.category)) {
      const existingSubCategory = await SubCategory.findOne({
        name,
        category: category || subCategory.category,
        _id: { $ne: subCategory._id },
      });
      if (existingSubCategory) {
        return res.status(400).json({
          success: false,
          error: 'SubCategory with this name already exists in this category',
        });
      }
    }

    // Handle category change - update counts
    if (category && category.toString() !== oldCategoryId.toString()) {
      // Decrement count in old category
      await Category.findByIdAndUpdate(oldCategoryId, {
        $inc: { subCategoryCount: -1 },
      });
      // Increment count in new category
      await Category.findByIdAndUpdate(category, {
        $inc: { subCategoryCount: 1 },
      });
    }

    if (name) subCategory.name = name;
    if (description !== undefined) subCategory.description = description;
    if (category) subCategory.category = category;

    if (req.file) {
      if (subCategory.image && subCategory.image.publicId) {
        try {
          await deleteFromCloudinary(subCategory.image.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old image:', deleteError);
        }
      }

      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/subcategories');
        subCategory.image = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    await subCategory.save();

    const populatedSubCategory = await SubCategory.findById(subCategory._id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    logger.info(`SubCategory updated: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'SubCategory updated successfully',
      data: populatedSubCategory,
    });
  } catch (error) {
    logger.error('Update subcategory error:', error);
    next(error);
  }
};

exports.deleteSubCategory = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    if (subCategory.image && subCategory.image.publicId) {
      try {
        await deleteFromCloudinary(subCategory.image.publicId);
      } catch (deleteError) {
        logger.error('Error deleting image from Cloudinary:', deleteError);
      }
    }

    // Store the category ID before deletion
    const categoryId = subCategory.category;

    await SubCategory.findByIdAndDelete(req.params.id);

    // Decrement subCategoryCount in the parent category
    await Category.findByIdAndUpdate(categoryId, {
      $inc: { subCategoryCount: -1 },
    });

    logger.info(`SubCategory deleted: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'SubCategory deleted successfully',
    });
  } catch (error) {
    logger.error('Delete subcategory error:', error);
    next(error);
  }
};

exports.toggleSubCategoryStatus = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    subCategory.isActive = !subCategory.isActive;
    await subCategory.save();

    logger.info(`SubCategory status toggled: ${subCategory.name} to ${subCategory.isActive} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `SubCategory ${subCategory.isActive ? 'activated' : 'deactivated'} successfully`,
      data: subCategory,
    });
  } catch (error) {
    logger.error('Toggle subcategory status error:', error);
    next(error);
  }
};

exports.getSubCategoriesByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const isActive = req.query.isActive;

    let query = { category: categoryId };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const subCategories = await SubCategory.find(query)
      .populate('category', 'name')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: subCategories.length,
      data: subCategories,
    });
  } catch (error) {
    logger.error('Get subcategories by category error:', error);
    next(error);
  }
};

exports.getSubCategoriesByLocation = async (req, res, next) => {
  try {
    // Latitude and longitude are required
    if (!req.query.latitude || !req.query.longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required parameters',
      });
    }

    const latitude = parseFloat(req.query.latitude);
    const longitude = parseFloat(req.query.longitude);
    const radius = parseFloat(req.query.radius) || 10; // Default 10km radius
    const category = req.query.category; // Optional category filter

    // Validate latitude and longitude are valid numbers
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude must be valid numbers',
      });
    }

    // Validate latitude and longitude ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude or longitude values. Latitude must be between -90 and 90, longitude between -180 and 180.',
      });
    }

    // Get all vendors with location data within the radius
    const vendors = await Vendor.find({
      storeAddress: {
        $exists: true,
        $ne: null,
      },
      'storeAddress.latitude': { $exists: true, $ne: null },
      'storeAddress.longitude': { $exists: true, $ne: null },
      isActive: true,
      storeId: { $exists: true },
    }).select('_id storeAddress storeName vendorName serviceRadius');

    // Filter vendors within the specified radius
    const nearbyVendorIds = [];
    vendors.forEach((vendor) => {
      const vendorLat = vendor.storeAddress.latitude;
      const vendorLon = vendor.storeAddress.longitude;
      const distance = calculateDistance(latitude, longitude, vendorLat, vendorLon);
      
      // Check if vendor is within radius (considering both user radius and vendor service radius)
      const vendorServiceRadius = vendor.serviceRadius || 5;
      const maxRadius = Math.max(radius, vendorServiceRadius);
      
      if (distance <= maxRadius) {
        nearbyVendorIds.push(vendor._id);
      }
    });

    // If no vendors found within radius, return empty result
    if (nearbyVendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No vendors found within the specified radius',
        count: 0,
        radius: radius,
        userLocation: {
          latitude: latitude,
          longitude: longitude,
        },
        data: [],
      });
    }

    // Build query for products from nearby vendors
    let productQuery = {
      vendor: { $in: nearbyVendorIds },
      approvalStatus: 'approved',
      isActive: true,
    };

    // Add category filter if provided
    if (category) {
      if (require('mongoose').Types.ObjectId.isValid(category)) {
        productQuery.category = category;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid category ID format',
        });
      }
    }

    // Get unique subcategory IDs from products within radius
    const products = await Product.find(productQuery)
      .select('subCategory')
      .distinct('subCategory');

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products found within the specified radius',
        count: 0,
        radius: radius,
        userLocation: {
          latitude: latitude,
          longitude: longitude,
        },
        data: [],
      });
    }

    // Get subcategories that have products in the area
    let subCategoryQuery = {
      _id: { $in: products },
      isActive: true,
    };

    // Add category filter to subcategory query if provided
    if (category) {
      subCategoryQuery.category = category;
    }

    const subCategories = await SubCategory.find(subCategoryQuery)
      .populate('category', 'name')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: subCategories.length,
      radius: radius,
      userLocation: {
        latitude: latitude,
        longitude: longitude,
      },
      data: subCategories,
    });
  } catch (error) {
    logger.error('Get subcategories by location error:', error);
    next(error);
  }
};