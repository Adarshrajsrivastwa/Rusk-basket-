const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { calculateDistance, parseClientLatLon, toNumberCoord } = require('../utils/distanceUtils');

exports.getNearbyProducts = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const radius = parseFloat(req.query.radius) || 10; // Default 10km

    const addr = user.address;
    if (!addr || addr.latitude == null || addr.longitude == null || addr.latitude === '' || addr.longitude === '') {
      return res.status(400).json({
        success: false,
        error: 'User location not set. Please update your profile with address and location coordinates.',
      });
    }

    const userLat = toNumberCoord(addr.latitude);
    const userLon = toNumberCoord(addr.longitude);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) {
      return res.status(400).json({
        success: false,
        error: 'User address has invalid latitude or longitude. Please update your profile.',
      });
    }

    // Get all vendors with location data
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
    const vendorDistances = {};

    vendors.forEach((vendor) => {
      const vendorLat = toNumberCoord(vendor.storeAddress.latitude);
      const vendorLon = toNumberCoord(vendor.storeAddress.longitude);
      if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLon)) {
        return;
      }
      const distance = calculateDistance(userLat, userLon, vendorLat, vendorLon);
      if (distance == null) {
        return;
      }

      // Check if vendor is within radius (considering both user radius and vendor service radius)
      const maxRadius = Math.max(radius, vendor.serviceRadius || 5);

      if (distance <= maxRadius) {
        nearbyVendorIds.push(vendor._id);
        vendorDistances[vendor._id.toString()] = {
          distance: parseFloat(distance.toFixed(2)),
          storeName: vendor.storeName,
          vendorName: vendor.vendorName,
        };
      }
    });

    if (nearbyVendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No vendors found within the specified radius',
        count: 0,
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        data: [],
      });
    }

    // Build query for products - only approved and active, no category/subcategory filters
    let query = {
      vendor: { $in: nearbyVendorIds },
      approvalStatus: 'approved',
      isActive: true,
    };

    // Get products
    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName storeAddress')
      .populate('createdBy', 'vendorName')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Add distance information to each product
    const productsWithDistance = products.map((product) => {
      const productObj = product.toObject();
      const vendorId = product.vendor._id.toString();
      if (vendorDistances[vendorId]) {
        productObj.distance = vendorDistances[vendorId].distance;
        productObj.vendorDistance = vendorDistances[vendorId];
      }
      return productObj;
    });

    // Sort by distance (closest first)
    productsWithDistance.sort((a, b) => {
      const distA = a.distance || Infinity;
      const distB = b.distance || Infinity;
      return distA - distB;
    });

    const total = await Product.countDocuments(query);

    logger.info(`User ${user.contactNumber} fetched ${productsWithDistance.length} nearby products within ${radius}km`);

    res.status(200).json({
      success: true,
      count: productsWithDistance.length,
      radius: radius,
      userLocation: {
        latitude: userLat,
        longitude: userLon,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithDistance,
    });
  } catch (error) {
    logger.error('Get nearby products error:', error);
    next(error);
  }
};

exports.getAllProducts = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Fixed limit
    const skip = (page - 1) * limit;
    const radius = parseFloat(req.query.radius) || 10; // Allow custom radius, default 10km

    const parsed = parseClientLatLon(req.query);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required (use latitude & longitude, or lat & lng).',
      });
    }
    const userLat = parsed.latitude;
    const userLon = parsed.longitude;
    if (parsed.corrected) {
      logger.info('User products: corrected client lat/lon order (South Asia heuristic)');
    }

    // Get all vendors with location data
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

    // Filter vendors within 10km radius
    const nearbyVendorIds = [];
    const vendorDistances = {};

    vendors.forEach((vendor) => {
      const vendorLat = toNumberCoord(vendor.storeAddress.latitude);
      const vendorLon = toNumberCoord(vendor.storeAddress.longitude);
      if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLon)) {
        return;
      }
      const distance = calculateDistance(userLat, userLon, vendorLat, vendorLon);
      if (distance == null) {
        return;
      }

      // Check if vendor is within 10km radius (considering both user radius and vendor service radius)
      const maxRadius = Math.max(radius, vendor.serviceRadius || 5);

      if (distance <= maxRadius) {
        nearbyVendorIds.push(vendor._id);
        vendorDistances[vendor._id.toString()] = {
          distance: distance,
          storeName: vendor.storeName,
          vendorName: vendor.vendorName,
        };
      }
    });

    if (nearbyVendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No vendors found within 10km radius',
        count: 0,
        radius: radius,
        userLocation: {
          latitude: userLat,
          longitude: userLon,
        },
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        data: [],
      });
    }

    // Build query for approved products only
    let query = {
      vendor: { $in: nearbyVendorIds },
      approvalStatus: 'approved',
      isActive: true,
    };

    // Add subCategory filter if provided (works with location-based search)
    if (req.query.subCategory) {
      if (mongoose.Types.ObjectId.isValid(req.query.subCategory)) {
        query.subCategory = req.query.subCategory;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid subCategory ID format',
        });
      }
    }

    // Add category filter if provided
    if (req.query.category) {
      if (mongoose.Types.ObjectId.isValid(req.query.category)) {
        query.category = req.query.category;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid category ID format',
        });
      }
    }

    // Add search filter if provided
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }
    
    // Add tag filter if provided
    if (req.query.tag) {
      query.tags = { $in: [req.query.tag.toLowerCase()] };
    }

    // Get products
    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName storeAddress')
      .populate('createdBy', 'vendorName')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Add distance information to each product
    const productsWithDistance = products.map((product) => {
      const productObj = product.toObject();
      const vendorId = product.vendor._id.toString();
      if (vendorDistances[vendorId]) {
        productObj.distance = vendorDistances[vendorId].distance;
        productObj.vendorDistance = vendorDistances[vendorId];
      }
      return productObj;
    });

    // Sort by distance (closest first)
    productsWithDistance.sort((a, b) => {
      const distA = a.distance || Infinity;
      const distB = b.distance || Infinity;
      return distA - distB;
    });

    const total = await Product.countDocuments(query);

    logger.info(`User ${user.contactNumber} fetched ${productsWithDistance.length} products within ${radius}km radius${req.query.subCategory ? ` for subCategory: ${req.query.subCategory}` : ''}`);

    const response = {
      success: true,
      count: productsWithDistance.length,
      radius: radius,
      userLocation: {
        latitude: userLat,
        longitude: userLon,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithDistance,
    };
    
    // Add filter info if subcategory or category is used
    if (req.query.subCategory) {
      response.filters = { subCategory: req.query.subCategory };
    }
    if (req.query.category) {
      response.filters = { ...response.filters, category: req.query.category };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get all products error:', error);
    next(error);
  }
};

