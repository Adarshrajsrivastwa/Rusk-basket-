const Product = require('../models/Product');
const logger = require('../utils/logger');

/**
 * Get all products for the authenticated vendor
 * Returns all products regardless of approvalStatus or isActive status
 */
exports.getVendorProducts = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query - get all products for this vendor, no status filter
    const query = {
      vendor: vendorId,
    };

    // Optional: filter by category if provided
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Optional: filter by subCategory if provided
    if (req.query.subCategory) {
      query.subCategory = req.query.subCategory;
    }

    // Optional: search by product name
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Get products with pagination
    const products = await Product.find(query)
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`Vendor products retrieved: ${vendorId} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: products,
    });
  } catch (error) {
    logger.error('Get vendor products error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
      });
    }
    next(error);
  }
};

/**
 * Get all products for admin
 * Returns all products regardless of approvalStatus or isActive status
 * Admin authentication required
 */
exports.getAllProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query - get all products, no status filter
    const query = {};

    // Optional: filter by vendor if provided
    if (req.query.vendor) {
      query.vendor = req.query.vendor;
    }

    // Optional: filter by category if provided
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Optional: filter by subCategory if provided
    if (req.query.subCategory) {
      query.subCategory = req.query.subCategory;
    }

    // Optional: filter by approvalStatus if provided
    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }

    // Optional: filter by isActive if provided
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true' || req.query.isActive === true;
    }

    // Optional: search by product name
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Get products with pagination
    const products = await Product.find(query)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'vendorName storeName contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`All products retrieved by Admin: ${req.admin.email || req.admin._id} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: products,
    });
  } catch (error) {
    logger.error('Get all products error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
      });
    }
    next(error);
  }
};
