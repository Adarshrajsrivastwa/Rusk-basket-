const Product = require('../models/Product');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { calculateDistance, parseClientLatLon, toNumberCoord } = require('../utils/distanceUtils');

/**
 * Extract date and time from Date object
 */
const extractDateAndTime = (dateObj) => {
  if (!dateObj) {
    return {
      date: null,
      time: null,
      dateTime: null
    };
  }
  
  const date = new Date(dateObj);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
    dateTime: date.toISOString()
  };
};

/**
 * Add date and time fields to product object
 */
const addDateTimeFields = (product) => {
  const startDateTime = extractDateAndTime(product.offerStartDate);
  const endDateTime = extractDateAndTime(product.offerEndDate);
  
  return {
    ...product,
    offerStartDate: product.offerStartDate,
    offerStartDateOnly: startDateTime.date,
    offerStartTime: startDateTime.time,
    offerEndDate: product.offerEndDate,
    offerEndDateOnly: endDateTime.date,
    offerEndTime: endDateTime.time,
  };
};

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
    const { 
      offerEnabled, 
      offerDiscountPercentage, 
      offerStartDate, 
      offerStartTime,
      offerEndDate, 
      offerEndTime,
      isDailyOffer 
    } = req.body;

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
      // Handle start date and time
      if (offerStartDate !== undefined) {
        if (offerStartDate === null || offerStartDate === '') {
          product.offerStartDate = null;
        } else {
          let startDateTime = new Date(offerStartDate);
          
          // If time is provided separately, combine with date
          if (offerStartTime) {
            const timeParts = offerStartTime.split(':');
            if (timeParts.length >= 2) {
              const hours = parseInt(timeParts[0]) || 0;
              const minutes = parseInt(timeParts[1]) || 0;
              const seconds = parseInt(timeParts[2]) || 0;
              
              startDateTime.setHours(hours, minutes, seconds, 0);
            }
          } else {
            // If no time provided and date is ISO format with time, keep it as is
            // Otherwise set to start of day (00:00:00)
            if (!offerStartDate.includes('T') && !offerStartDate.includes(' ')) {
              startDateTime.setHours(0, 0, 0, 0);
            }
          }
          
          product.offerStartDate = startDateTime;
        }
      }

      // Handle end date and time
      if (offerEndDate !== undefined) {
        if (offerEndDate === null || offerEndDate === '') {
          product.offerEndDate = null;
        } else {
          let endDateTime = new Date(offerEndDate);
          
          // If time is provided separately, combine with date
          if (offerEndTime) {
            const timeParts = offerEndTime.split(':');
            if (timeParts.length >= 2) {
              const hours = parseInt(timeParts[0]) || 0;
              const minutes = parseInt(timeParts[1]) || 0;
              const seconds = parseInt(timeParts[2]) || 0;
              
              endDateTime.setHours(hours, minutes, seconds, 0);
            }
          } else {
            // If no time provided and date is ISO format with time, keep it as is
            // Otherwise set to end of day (23:59:59)
            if (!offerEndDate.includes('T') && !offerEndDate.includes(' ')) {
              endDateTime.setHours(23, 59, 59, 999);
            }
          }
          
          product.offerEndDate = endDateTime;
        }
      }
    }

    if (isDailyOffer !== undefined) {
      product.isDailyOffer = isDailyOffer;
    }

    if (product.offerStartDate && product.offerEndDate && product.offerEndDate <= product.offerStartDate) {
      return res.status(400).json({
        success: false,
        error: 'End date and time must be after start date and time',
      });
    }

    const now = new Date();
    
    // Auto-enable daily offer if dates are in current range
    if (product.isDailyOffer && (product.offerStartDate || product.offerEndDate)) {
      let isWithinDateRange = true;
      
      if (product.offerStartDate) {
        const startDate = new Date(product.offerStartDate);
        startDate.setHours(0, 0, 0, 0); // Set to start of day
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        if (today < startDate) {
          isWithinDateRange = false;
        }
      }
      
      if (product.offerEndDate) {
        const endDate = new Date(product.offerEndDate);
        endDate.setHours(23, 59, 59, 999); // Set to end of day
        if (now > endDate) {
          isWithinDateRange = false;
        }
      }
      
      // Auto-enable if dates are in current range and isDailyOffer is true
      if (isWithinDateRange && product.isDailyOffer) {
        product.offerEnabled = true;
        logger.info(`Auto-enabled daily offer for product ${product._id} - dates are in current range`);
      }
    }
    
    // Handle date range validation for existing offers (when offerEnabled is not explicitly set)
    if ((product.offerStartDate || product.offerEndDate) && offerEnabled === undefined) {
      let isWithinDateRange = true;
      
      if (product.offerStartDate) {
        const startDate = new Date(product.offerStartDate);
        startDate.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        if (today < startDate) {
          isWithinDateRange = false;
        }
      }
      
      if (product.offerEndDate) {
        const endDate = new Date(product.offerEndDate);
        endDate.setHours(23, 59, 59, 999);
        if (now > endDate) {
          isWithinDateRange = false;
        }
      }
      
      // Auto-enable if within date range and has discount
      if (isWithinDateRange && product.offerDiscountPercentage > 0) {
        product.offerEnabled = true;
        logger.info(`Auto-enabled offer for product ${product._id} - dates are in current range`);
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

    const updatedProductObj = updatedProduct.toObject ? updatedProduct.toObject() : updatedProduct;
    const productWithDateTime = addDateTimeFields(updatedProductObj);

    res.status(200).json({
      success: true,
      message: product.offerEnabled ? 'Product offer enabled successfully' : 'Product offer disabled successfully',
      data: productWithDateTime,
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

    // Add date and time fields to each product
    const productsWithDateTime = products.map(product => {
      const productObj = product.toObject ? product.toObject() : product;
      return addDateTimeFields(productObj);
    });

    res.status(200).json({
      success: true,
      count: productsWithDateTime.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: productsWithDateTime,
    });
  } catch (error) {
    logger.error('Get vendor offers error:', error);
    next(error);
  }
};

exports.getProductOffer = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const vendorId = req.vendor ? req.vendor._id : null;

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

    // If vendor is accessing, ensure they can only view their own products
    if (vendorId && product.vendor.toString() !== vendorId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only view offers for your own products',
      });
    }

    const productObj = product.toObject ? product.toObject() : product;
    const productWithDateTime = addDateTimeFields(productObj);
    
    res.status(200).json({
      success: true,
      data: {
        offerEnabled: product.offerEnabled,
        offerDiscountPercentage: product.offerDiscountPercentage,
        offerStartDate: product.offerStartDate,
        offerStartDateOnly: productWithDateTime.offerStartDateOnly,
        offerStartTime: productWithDateTime.offerStartTime,
        offerEndDate: product.offerEndDate,
        offerEndDateOnly: productWithDateTime.offerEndDateOnly,
        offerEndTime: productWithDateTime.offerEndTime,
        isDailyOffer: product.isDailyOffer,
        product: productWithDateTime,
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

    // Add date and time fields to each product
    const productsWithDateTime = products.map(product => {
      const productObj = product.toObject ? product.toObject() : product;
      return addDateTimeFields(productObj);
    });

    res.status(200).json({
      success: true,
      count: productsWithDateTime.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: productsWithDateTime,
    });
  } catch (error) {
    logger.error('Get vendor daily offers error:', error);
    next(error);
  }
};

exports.getAllDailyOffers = async (req, res, next) => {
  try {
    const { radius = 10, page = 1, limit = 20, category, subCategory, search, vendorId } = req.query;

    const parsed = parseClientLatLon(req.query);
    const hasLocation = !!parsed;
    let userLat;
    let userLon;
    let searchRadius;

    if (hasLocation) {
      userLat = parsed.latitude;
      userLon = parsed.longitude;
      searchRadius = parseFloat(radius) || 10;
      if (parsed.corrected) {
        logger.info('getAllDailyOffers: corrected client lat/lon order (South Asia heuristic)');
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

          const vendorLat = toNumberCoord(product.vendor.storeAddress.latitude);
          const vendorLon = toNumberCoord(product.vendor.storeAddress.longitude);
          const vendorServiceRadius = toNumberCoord(product.vendor.serviceRadius);
          const svcR = Number.isFinite(vendorServiceRadius) ? vendorServiceRadius : 0;

          if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLon) || svcR <= 0) {
            return null;
          }

          const vendorStoreDistance = calculateDistance(
            userLat,
            userLon,
            vendorLat,
            vendorLon
          );
          if (vendorStoreDistance == null) {
            return null;
          }

          let productDistance = null;
          const pLat = toNumberCoord(product.latitude);
          const pLon = toNumberCoord(product.longitude);
          if (Number.isFinite(pLat) && Number.isFinite(pLon)) {
            productDistance = calculateDistance(
              userLat,
              userLon,
              pLat,
              pLon
            );
          }

          let shouldShow = false;
          let displayDistance = null;

          if (productDistance != null && productDistance <= searchRadius) {
            shouldShow = true;
            displayDistance = productDistance;
          } else if (vendorStoreDistance <= svcR) {
            shouldShow = true;
            displayDistance = vendorStoreDistance;
          }

          if (!shouldShow) {
            return null;
          }

          const productWithDateTime = addDateTimeFields(product);
          return {
            ...productWithDateTime,
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
        .map(product => {
          const productWithDateTime = addDateTimeFields(product);
          return {
            ...productWithDateTime,
            discountPercentage: product.offerDiscountPercentage || 0,
          };
        })
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
