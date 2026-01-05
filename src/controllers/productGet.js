const Product = require('../models/Product');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

exports.getProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.admin) {
      if (req.query.approvalStatus) {
        query.approvalStatus = req.query.approvalStatus;
      }
      if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
      }
    } else if (req.vendor) {
      query.vendor = req.vendor._id;
      if (req.query.approvalStatus) {
        query.approvalStatus = req.query.approvalStatus;
      }
      if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
      }
    } else {
      query.approvalStatus = 'approved';
      query.isActive = true;
    }

    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.subCategory) {
      query.subCategory = req.query.subCategory;
    }

    if (req.query.tag) {
      query.tags = { $in: [req.query.tag.toLowerCase()] };
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

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
    logger.error('Get products error:', error);
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    let query = { _id: req.params.id };

    if (!req.admin && !req.vendor) {
      query.approvalStatus = 'approved';
      query.isActive = true;
    } else if (req.vendor && !req.admin) {
      query.vendor = req.vendor._id;
    }

    const product = await Product.findOne(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName')
      .populate('approvedBy', 'name email');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Get product error:', error);
    next(error);
  }
};

exports.getPendingProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { approvalStatus: 'pending' };

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

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
    logger.error('Get pending products error:', error);
    next(error);
  }
};


