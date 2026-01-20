const Product = require('../models/Product');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.toggleProductOffer = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { productId } = req.params;
    const { offerEnabled, offerDiscountPercentage, offerStartDate, offerEndDate, isDailyOffer } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    if (product.vendor.toString() !== vendorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only manage offers for your own products',
      });
    }

    if (offerEnabled === false) {
      product.offerEnabled = false;
      product.offerStartDate = undefined;
      product.offerEndDate = undefined;
      if (product.originalSalePrice != null) {
        product.salePrice = product.originalSalePrice;
        product.originalSalePrice = undefined;
      }
    } else if (offerEnabled !== undefined) {
      product.offerEnabled = offerEnabled;
    }

    if (offerDiscountPercentage !== undefined) {
      const discount = parseFloat(offerDiscountPercentage);
      if (isNaN(discount) || discount < 0 || discount > 100) {
        return res.status(400).json({
          success: false,
          error: 'Discount percentage must be between 0 and 100',
        });
      }
      product.offerDiscountPercentage = discount;
    }

    if (offerEnabled !== false) {
      if (offerStartDate !== undefined) {
        product.offerStartDate = offerStartDate ? new Date(offerStartDate) : null;
      }

      if (offerEndDate !== undefined) {
        product.offerEndDate = offerEndDate ? new Date(offerEndDate) : null;
      }
    }

    if (isDailyOffer !== undefined) {
      product.isDailyOffer = isDailyOffer;
    }

    if (product.offerStartDate && product.offerEndDate && product.offerEndDate <= product.offerStartDate) {
      return res.status(400).json({
        success: false,
        error: 'End date must be after start date',
      });
    }

    const now = new Date();
    if ((product.offerStartDate || product.offerEndDate) && offerEnabled === undefined) {
      let isWithinDateRange = true;
      
      if (product.offerStartDate) {
        const startDate = new Date(product.offerStartDate);
        if (now < startDate) {
          isWithinDateRange = false;
        }
      }
      
      if (product.offerEndDate) {
        const endDate = new Date(product.offerEndDate);
        if (now > endDate) {
          isWithinDateRange = false;
        }
      }
      
      if (product.offerDiscountPercentage > 0) {
        product.offerEnabled = isWithinDateRange;
      }
    }

    if (product.offerEnabled && (!product.offerDiscountPercentage || product.offerDiscountPercentage === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Discount percentage is required when offer is enabled',
      });
    }

    if (product.offerEnabled && product.offerDiscountPercentage > 0 && product.regularPrice > 0) {
      if (!product.originalSalePrice && product.salePrice) {
        product.originalSalePrice = parseFloat(product.salePrice);
      }
      
      const now = new Date();
      let isWithinDateRange = true;
      
      if (product.offerStartDate || product.offerEndDate) {
        if (product.offerStartDate) {
          const startDate = new Date(product.offerStartDate);
          if (now < startDate) {
            isWithinDateRange = false;
          }
        }
        
        if (product.offerEndDate) {
          const endDate = new Date(product.offerEndDate);
          if (now > endDate) {
            isWithinDateRange = false;
          }
        }
      }
      
      if (isWithinDateRange) {
        const discountAmount = (product.regularPrice * product.offerDiscountPercentage) / 100;
        product.salePrice = product.regularPrice - discountAmount;
      }
    }

    await product.save();

    const updatedProduct = await Product.findById(productId)
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .populate('vendor', 'vendorName storeName');

    logger.info(`Product offer updated for ${product.productName} by vendor ${req.vendor.storeId || req.vendor._id}`);

    res.status(200).json({
      success: true,
      message: product.offerEnabled ? 'Product offer enabled successfully' : 'Product offer disabled successfully',
      data: updatedProduct,
    });
  } catch (error) {
    logger.error('Toggle product offer error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.getVendorOffers = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const { page = 1, limit = 10, status = 'all' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let query = { vendor: vendorId };

    const now = new Date();
    if (status === 'active') {
      query.offerEnabled = true;
      query.$or = [
        { offerStartDate: { $exists: false } },
        { offerStartDate: null },
        { offerStartDate: { $lte: now } },
      ];
      query.$and = [
        {
          $or: [
            { offerEndDate: { $exists: false } },
            { offerEndDate: null },
            { offerEndDate: { $gte: now } },
          ],
        },
      ];
    } else if (status === 'upcoming') {
      query.offerEnabled = true;
      query.offerStartDate = { $gt: now };
    } else if (status === 'expired') {
      query.$or = [
        { offerEnabled: false },
        { offerEndDate: { $lt: now } },
      ];
    } else if (status === 'enabled') {
      query.offerEnabled = true;
    }

    const products = await Product.find(query)
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: products,
    });
  } catch (error) {
    logger.error('Get vendor offers error:', error);
    next(error);
  }
};

exports.getProductOffer = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId)
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .populate('vendor', 'vendorName storeName');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        offerEnabled: product.offerEnabled,
        offerDiscountPercentage: product.offerDiscountPercentage,
        offerStartDate: product.offerStartDate,
        offerEndDate: product.offerEndDate,
        isDailyOffer: product.isDailyOffer,
        product: product,
      },
    });
  } catch (error) {
    logger.error('Get product offer error:', error);
    next(error);
  }
};

exports.getVendorDailyOffers = async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendor ID format',
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const now = new Date();

    const query = {
      vendor: vendorId,
      approvalStatus: 'approved',
      isActive: true,
      offerEnabled: true,
      isDailyOffer: true,
      $or: [
        { offerStartDate: { $exists: false } },
        { offerStartDate: null },
        { offerStartDate: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { offerEndDate: { $exists: false } },
            { offerEndDate: null },
            { offerEndDate: { $gte: now } },
          ],
        },
      ],
    };

    const products = await Product.find(query)
      .populate('category', 'categoryName')
      .populate('subCategory', 'subCategoryName')
      .populate('vendor', 'vendorName storeName storeAddress contactNumber')
      .select('-originalSalePrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: products,
    });
  } catch (error) {
    logger.error('Get vendor daily offers error:', error);
    next(error);
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

exports.getAllDailyOffers = async (req, res, next) => {
  try {
    const { latitude, longitude, radius = 10, page = 1, limit = 20, category, subCategory, search, vendorId } = req.query;

    const hasLocation = latitude && longitude;
    let userLat, userLon, searchRadius;

    if (hasLocation) {
      userLat = parseFloat(latitude);
      userLon = parseFloat(longitude);
      searchRadius = parseFloat(radius) || 10;

      if (isNaN(userLat) || userLat < -90 || userLat > 90) {
        return res.status(400).json({
          success: false,
          error: 'Invalid latitude. Must be between -90 and 90',
        });
      }

      if (isNaN(userLon) || userLon < -180 || userLon > 180) {
        return res.status(400).json({
          success: false,
          error: 'Invalid longitude. Must be between -180 and 180',
        });
      }
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    const query = {
      approvalStatus: 'approved',
      isActive: true,
      offerEnabled: true,
      isDailyOffer: true,
      $or: [
        { offerStartDate: { $exists: false } },
        { offerStartDate: null },
        { offerStartDate: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { offerEndDate: { $exists: false } },
            { offerEndDate: null },
            { offerEndDate: { $gte: now } },
          ],
        },
      ],
    };

    if (hasLocation) {
      query.latitude = { $exists: true, $ne: null };
      query.longitude = { $exists: true, $ne: null };
    }

    if (vendorId) {
      if (!/^[0-9a-fA-F]{24}$/.test(vendorId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid vendor ID format',
        });
      }
      query.vendor = vendorId;
    }

    if (category) {
      if (!/^[0-9a-fA-F]{24}$/.test(category)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid category ID format',
        });
      }
      query.category = category;
    }

    if (subCategory) {
      if (!/^[0-9a-fA-F]{24}$/.test(subCategory)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid subCategory ID format',
        });
      }
      query.subCategory = subCategory;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const products = await Product.find(query)
      .populate('category', 'name categoryName')
      .populate('subCategory', 'name subCategoryName')
      .populate('vendor', 'vendorName storeName contactNumber serviceRadius storeAddress')
      .populate('createdBy', 'vendorName')
      .select('-originalSalePrice')
      .lean();

    let finalProducts;
    let total;

    if (hasLocation) {
      const productsWithDistance = products
        .map(product => {
          if (!product.vendor || !product.vendor.storeAddress) {
            return null;
          }

          const vendorLat = product.vendor.storeAddress.latitude;
          const vendorLon = product.vendor.storeAddress.longitude;
          const vendorServiceRadius = product.vendor.serviceRadius || 0;

          if (!vendorLat || !vendorLon || vendorServiceRadius <= 0) {
            return null;
          }

          const vendorStoreDistance = calculateDistance(
            userLat,
            userLon,
            vendorLat,
            vendorLon
          );

          let productDistance = null;
          if (product.latitude && product.longitude) {
            productDistance = calculateDistance(
              userLat,
              userLon,
              product.latitude,
              product.longitude
            );
          }

          let shouldShow = false;
          let displayDistance = null;

          if (productDistance !== null && productDistance <= searchRadius) {
            shouldShow = true;
            displayDistance = productDistance;
          } else if (vendorStoreDistance <= vendorServiceRadius) {
            shouldShow = true;
            displayDistance = vendorStoreDistance;
          }

          if (!shouldShow) {
            return null;
          }

          return {
            ...product,
            distance: parseFloat(displayDistance.toFixed(2)),
            discountPercentage: product.offerDiscountPercentage || 0,
          };
        })
        .filter(product => product !== null)
        .sort((a, b) => a.distance - b.distance);

      total = productsWithDistance.length;
      finalProducts = productsWithDistance;
    } else {
      finalProducts = products
        .map(product => ({
          ...product,
          discountPercentage: product.offerDiscountPercentage || 0,
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      total = finalProducts.length;
    }

    const paginatedProducts = finalProducts.slice(skip, skip + limitNum);

    const logMessage = hasLocation
      ? `Daily offers retrieved: Lat: ${userLat}, Lon: ${userLon}, Radius: ${searchRadius}km, Found: ${total}, Page: ${pageNum}${subCategory ? `, SubCategory: ${subCategory}` : ''}${category ? `, Category: ${category}` : ''}`
      : `Daily offers retrieved: Found: ${total}, Page: ${pageNum}${subCategory ? `, SubCategory: ${subCategory}` : ''}${category ? `, Category: ${category}` : ''}`;

    logger.info(logMessage);

    const response = {
      success: true,
      count: paginatedProducts.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      filters: {
        ...(subCategory && { subCategory }),
        ...(category && { category }),
        ...(search && { search }),
        ...(vendorId && { vendorId }),
      },
      data: paginatedProducts,
    };

    if (hasLocation) {
      response.location = {
        latitude: userLat,
        longitude: userLon,
        radius: searchRadius,
      };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get all daily offers error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
      });
    }
    next(error);
  }
};
