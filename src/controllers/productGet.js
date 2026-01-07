const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

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

exports.getProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Latitude and longitude are now required
    if (!req.query.latitude || !req.query.longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required parameters',
      });
    }
    
    const latitude = parseFloat(req.query.latitude);
    const longitude = parseFloat(req.query.longitude);
    const radius = parseFloat(req.query.radius) || 10; // Default 10km radius
    
    // Validate latitude and longitude are valid numbers
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude must be valid numbers',
      });
    }

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

    // Validate latitude and longitude ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude or longitude values. Latitude must be between -90 and 90, longitude between -180 and 180.',
      });
    }

    // Location-based filtering - now always required
    let nearbyVendorIds = [];
    let vendorDistances = {};

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
    vendors.forEach((vendor) => {
      const vendorLat = vendor.storeAddress.latitude;
      const vendorLon = vendor.storeAddress.longitude;
      const distance = calculateDistance(latitude, longitude, vendorLat, vendorLon);
      
      // Check if vendor is within radius (considering both user radius and vendor service radius)
      const vendorServiceRadius = vendor.serviceRadius || 5;
      const maxRadius = Math.max(radius, vendorServiceRadius);
      
      if (distance <= maxRadius) {
        nearbyVendorIds.push(vendor._id);
        vendorDistances[vendor._id.toString()] = {
          distance: parseFloat(distance.toFixed(2)),
          storeName: vendor.storeName,
          vendorName: vendor.vendorName,
        };
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
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        data: [],
      });
    }

    // Filter products by nearby vendors
    query.vendor = { $in: nearbyVendorIds };

    // Text search
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Category filter
    if (req.query.category) {
      // Validate ObjectId format
      if (mongoose.Types.ObjectId.isValid(req.query.category)) {
        query.category = req.query.category;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid category ID format',
        });
      }
    }

    // SubCategory filter - main search parameter
    if (req.query.subCategory) {
      // Validate ObjectId format
      if (mongoose.Types.ObjectId.isValid(req.query.subCategory)) {
        query.subCategory = req.query.subCategory;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid subCategory ID format',
        });
      }
    }

    // Tag filter
    if (req.query.tag) {
      query.tags = { $in: [req.query.tag.toLowerCase()] };
    }

    // For location-based search, fetch products from nearby vendors
    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName storeAddress serviceRadius')
      .populate('createdBy', 'vendorName')
      .sort({ createdAt: -1 });

    // Add distance information to each product based on vendor location
    let productsWithDistance = products.map((product) => {
      const productObj = product.toObject();
      const vendorId = product.vendor?._id?.toString();
      if (vendorId && vendorDistances[vendorId]) {
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

    // Calculate total before pagination
    const total = productsWithDistance.length;

    // Apply pagination after filtering
    productsWithDistance = productsWithDistance.slice(skip, skip + limit);

    const response = {
      success: true,
      count: productsWithDistance.length,
      radius: radius,
      userLocation: {
        latitude: latitude,
        longitude: longitude,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithDistance,
    };

    res.status(200).json(response);
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


