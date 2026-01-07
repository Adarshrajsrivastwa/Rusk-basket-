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
    const latitude = parseFloat(req.query.latitude);
    const longitude = parseFloat(req.query.longitude);
    const radius = parseFloat(req.query.radius) || 10; // Default 10km radius

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

    // Location-based filtering if latitude and longitude are provided
    let vendorDistances = {};
    
    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      // Validate latitude and longitude ranges
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          error: 'Invalid latitude or longitude values. Latitude must be between -90 and 90, longitude between -180 and 180.',
        });
      }

      // Get all products with location data and calculate distances
      // We'll filter after fetching to calculate distances accurately
      query.latitude = { $exists: true, $ne: null };
      query.longitude = { $exists: true, $ne: null };
    }

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

    let products;
    let productsWithDistance;
    let total;

    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      // For location-based search, fetch all products with location and filter in memory
      products = await Product.find(query)
        .populate('category', 'name')
        .populate('subCategory', 'name')
        .populate('vendor', 'vendorName storeName storeAddress serviceRadius')
        .populate('createdBy', 'vendorName');
      // Calculate distances and filter products within radius
      productsWithDistance = [];
      
      for (const product of products) {
        if (product.latitude && product.longitude) {
          const distance = calculateDistance(latitude, longitude, product.latitude, product.longitude);
          
          // Check if product is within radius (considering both user radius and vendor service radius)
          const vendorServiceRadius = product.vendor?.serviceRadius || 5;
          const maxRadius = Math.max(radius, vendorServiceRadius);
          
          if (distance <= maxRadius) {
            const productObj = product.toObject();
            productObj.distance = parseFloat(distance.toFixed(2));
            if (product.vendor) {
              productObj.vendorDistance = {
                distance: parseFloat(distance.toFixed(2)),
                storeName: product.vendor.storeName,
                vendorName: product.vendor.vendorName,
              };
            }
            productsWithDistance.push(productObj);
          }
        }
      }

      // Sort by distance (closest first)
      productsWithDistance.sort((a, b) => {
        const distA = a.distance || Infinity;
        const distB = b.distance || Infinity;
        return distA - distB;
      });

      // Calculate total before pagination
      total = productsWithDistance.length;

      // Apply pagination after filtering
      productsWithDistance = productsWithDistance.slice(skip, skip + limit);
    } else {
      // For non-location search, use normal pagination
      products = await Product.find(query)
        .populate('category', 'name')
        .populate('subCategory', 'name')
        .populate('vendor', 'vendorName storeName storeAddress')
        .populate('createdBy', 'vendorName')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      productsWithDistance = products;
      total = await Product.countDocuments(query);
    }

    const response = {
      success: true,
      count: productsWithDistance.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithDistance,
    };

    // Add location info if location-based search
    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      response.radius = radius;
      response.userLocation = {
        latitude: latitude,
        longitude: longitude,
      };
    }

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


