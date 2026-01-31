const Product = require('../models/Product');
const { checkAndDisableExpiredOffer } = require('../utils/offerExpiryService');
const logger = require('../utils/logger');

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

/**
 * Calculate discount percentage based on regular price and sale price
 * Returns discount percentage rounded to 2 decimal places
 */
const calculateDiscountPercentage = (regularPrice, salePrice) => {
  if (!regularPrice || regularPrice <= 0) {
    return 0;
  }
  if (!salePrice || salePrice >= regularPrice) {
    return 0;
  }
  const discount = ((regularPrice - salePrice) / regularPrice) * 100;
  return parseFloat(discount.toFixed(2));
};

const applyOfferToProducts = async (products) => {
  const productArray = Array.isArray(products) ? products : [products];
  const now = new Date();
  
  const productsWithOffers = productArray.map(product => {
    let isOfferActive = false;
    
    if (product.offerEnabled && product.offerDiscountPercentage > 0) {
      if (product.offerStartDate && product.offerEndDate) {
        const startDate = new Date(product.offerStartDate);
        const endDate = new Date(product.offerEndDate);
        isOfferActive = now >= startDate && now <= endDate;
      } else if (product.offerStartDate) {
        const startDate = new Date(product.offerStartDate);
        isOfferActive = now >= startDate;
      } else if (product.offerEndDate) {
        const endDate = new Date(product.offerEndDate);
        isOfferActive = now <= endDate;
      } else {
        isOfferActive = true;
      }
    }
    
    if (isOfferActive) {
      return {
        ...product,
        hasOffer: true,
        offer: {
          discountPercentage: product.offerDiscountPercentage,
          startDate: product.offerStartDate,
          endDate: product.offerEndDate,
          isDailyOffer: product.isDailyOffer,
        },
        discountPercentage: product.offerDiscountPercentage,
      };
    }
    
    return {
      ...product,
      hasOffer: false,
      discountPercentage: calculateDiscountPercentage(product.regularPrice, product.salePrice),
    };
  });
  
  return Array.isArray(products) ? productsWithOffers : productsWithOffers[0];
};

/**
 * Add discount percentage to product(s)
 * Can handle single product object or array of products
 */
const addDiscountToProduct = (product) => {
  if (Array.isArray(product)) {
    return product.map(p => ({
      ...p,
      discountPercentage: calculateDiscountPercentage(p.regularPrice, p.salePrice),
    }));
  }
  return {
    ...product,
    discountPercentage: calculateDiscountPercentage(product.regularPrice, product.salePrice),
  };
};

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
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Helper function to format date to DD/MM/YYYY
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Transform products to include additional fields
    const productsWithNames = products.map(product => ({
      ...product,
      categoryName: product.category?.name || null,
      subCategoryName: product.subCategory?.name || null,
      vendorName: product.vendor?.vendorName || null,
      date: formatDate(product.createdAt),
      sellPrice: product.salePrice || null,
      status: product.approvalStatus || 'pending',
    }));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`Vendor products retrieved: ${vendorId} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: productsWithNames.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithNames,
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
 * Get all products for admin - simplified list view
 * Returns products with only essential fields: Product ID, Date, Vendor, Category, Sub Category, Sale Price, Status
 * Admin authentication required
 */
exports.getAllProductsList = async (req, res, next) => {
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
      .populate('vendor', 'vendorName')
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .select('_id createdAt vendor category subCategory salePrice approvalStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Helper function to format date to DD/MM/YYYY
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Transform products to include only required fields
    const productsList = products.map(product => ({
      _id: product._id,
      productId: product._id,
      date: formatDate(product.createdAt),
      vendor: product.vendor?.vendorName || null,
      category: product.category?.name || null,
      subCategory: product.subCategory?.name || null,
      salePrice: product.salePrice || null,
      status: product.approvalStatus || 'pending',
    }));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`All products list retrieved by Admin: ${req.admin.email || req.admin._id} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: productsList.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsList,
    });
  } catch (error) {
    logger.error('Get all products list error:', error);
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

    // Apply offer discounts to products (overrides salePrice if active offer exists)
    const productsWithOffers = await applyOfferToProducts(products);

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`All products retrieved by Admin: ${req.admin.email || req.admin._id} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: productsWithOffers.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithOffers,
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

/**
 * Get approved products with optional location filtering
 * Only returns products with approvalStatus: 'approved' and isActive: true
 * If latitude/longitude are provided, filters by distance
 * Otherwise, returns products filtered by other criteria (category, subCategory, etc.)
 */
exports.getNearbyProducts = async (req, res, next) => {
  try {
    const { latitude, longitude, radius = 10, page = 1, limit = 20, category, subCategory, search } = req.query;

    const hasLocation = latitude && longitude;
    let userLat, userLon, searchRadius;

    if (hasLocation) {
      userLat = parseFloat(latitude);
      userLon = parseFloat(longitude);
      searchRadius = parseFloat(radius) || 10; // Default 10km radius

      // Validate coordinates
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

    // Build query - only approved and active products
    const query = {
      approvalStatus: 'approved',
      isActive: true,
    };

    // If location is provided, require products to have coordinates
    if (hasLocation) {
      query.latitude = { $exists: true, $ne: null };
      query.longitude = { $exists: true, $ne: null };
    }

    // Optional filters
    if (category) {
      // Validate category ObjectId format
      if (!/^[0-9a-fA-F]{24}$/.test(category)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid category ID format',
        });
      }
      query.category = category;
    }

    if (subCategory) {
      // Validate subCategory ObjectId format
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

    // Get all products matching the filters
    const products = await Product.find(query)
      .populate('category', 'name categoryName')
      .populate('subCategory', 'name subCategoryName')
      .populate('vendor', 'vendorName storeName contactNumber serviceRadius storeAddress')
      .populate('createdBy', 'vendorName')
      .lean();

    let finalProducts;
    let total;

    if (hasLocation) {
      // Calculate distance for each product and filter by user query radius OR vendor serviceRadius
      // Product will be shown if:
      // 1. Product location is within user's query radius, OR
      // 2. User location is within vendor's serviceRadius (even if product is not in user's query radius)
      const productsWithDistance = products
        .map(product => {
          // Check if vendor exists and has storeAddress with coordinates and serviceRadius
          if (!product.vendor || !product.vendor.storeAddress) {
            return null;
          }

          const vendorLat = product.vendor.storeAddress.latitude;
          const vendorLon = product.vendor.storeAddress.longitude;
          const vendorServiceRadius = product.vendor.serviceRadius || 0;

          if (!vendorLat || !vendorLon || vendorServiceRadius <= 0) {
            return null;
          }

          // Calculate distance from user location to vendor store location
          const vendorStoreDistance = calculateDistance(
            userLat,
            userLon,
            vendorLat,
            vendorLon
          );

          // Calculate distance from user location to product location (if product has coordinates)
          let productDistance = null;
          if (product.latitude && product.longitude) {
            productDistance = calculateDistance(
              userLat,
              userLon,
              product.latitude,
              product.longitude
            );
          }

          // Product should be shown if EITHER:
          // 1. Product is within user's query radius, OR
          // 2. User is within vendor's serviceRadius (regardless of product location)
          let shouldShow = false;
          let displayDistance = null;

          // Check if product location is within user's query radius
          if (productDistance !== null && productDistance <= searchRadius) {
            shouldShow = true;
            displayDistance = productDistance;
          }
          // Check if user is within vendor's serviceRadius
          else if (vendorStoreDistance <= vendorServiceRadius) {
            shouldShow = true;
            // Use vendor store distance for sorting if product distance is not available
            displayDistance = productDistance !== null ? productDistance : vendorStoreDistance;
          }

          if (!shouldShow) {
            return null;
          }

          return {
            ...product,
            distance: parseFloat(displayDistance.toFixed(2)), // Distance in km, rounded to 2 decimals
            discountPercentage: calculateDiscountPercentage(product.regularPrice, product.salePrice),
          };
        })
        .filter(product => product !== null)
        .sort((a, b) => a.distance - b.distance); // Sort by distance (nearest first)

      total = productsWithDistance.length;
      finalProducts = productsWithDistance;
    } else {
      // No location provided, sort by creation date (newest first)
      finalProducts = products
        .map(product => ({
          ...product,
          discountPercentage: calculateDiscountPercentage(product.regularPrice, product.salePrice),
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      total = finalProducts.length;
    }

    // Apply pagination
    const paginatedProducts = finalProducts.slice(skip, skip + limitNum);

    // Apply offer discounts to products (overrides salePrice if active offer exists)
    const productsWithOffers = await applyOfferToProducts(paginatedProducts);

    const logMessage = hasLocation
      ? `Products retrieved: Lat: ${userLat}, Lon: ${userLon}, Radius: ${searchRadius}km, Found: ${total}, Page: ${pageNum}${subCategory ? `, SubCategory: ${subCategory}` : ''}${category ? `, Category: ${category}` : ''}`
      : `Products retrieved: Found: ${total}, Page: ${pageNum}${subCategory ? `, SubCategory: ${subCategory}` : ''}${category ? `, Category: ${category}` : ''}`;

    logger.info(logMessage);

    const response = {
      success: true,
      count: productsWithOffers.length,
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
      },
      data: productsWithOffers,
    };

    // Include location info only if location was provided
    if (hasLocation) {
      response.location = {
        latitude: userLat,
        longitude: userLon,
        radius: searchRadius,
      };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get products error:', error);
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
 * Get pending products for admin
 * Returns only products with approvalStatus: 'pending'
 * Admin authentication required
 */
exports.getPendingProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query - only pending products
    const query = {
      approvalStatus: 'pending',
    };

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

    // Optional: filter by isActive if provided
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true' || req.query.isActive === true;
    }

    // Optional: search by product name
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Get products with pagination, sorted by creation date (newest first)
    const products = await Product.find(query)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('createdBy', 'vendorName storeName contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Helper function to format date to DD/MM/YYYY
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Apply offer discounts to products (overrides salePrice if active offer exists)
    const productsWithOffers = await applyOfferToProducts(products);

    // Transform products to include additional fields
    const productsWithNames = productsWithOffers.map(product => ({
      ...product,
      categoryName: product.category?.name || null,
      subCategoryName: product.subCategory?.name || null,
      vendorName: product.vendor?.vendorName || null,
      date: formatDate(product.createdAt),
      sellPrice: product.salePrice || null,
      status: product.approvalStatus || 'pending',
    }));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    logger.info(`Pending products retrieved by Admin: ${req.admin.email || req.admin._id} - Total: ${total}, Page: ${page}`);

    res.status(200).json({
      success: true,
      count: productsWithNames.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: productsWithNames,
    });
  } catch (error) {
    logger.error('Get pending products error:', error);
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
 * Get a single product by ID
 * Public endpoint - returns approved products
 * For pending/rejected products, authentication may be required in future
 */
exports.getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    // Find product by ID
    const product = await Product.findById(id)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('category', 'name categoryName')
      .populate('subCategory', 'name subCategoryName')
      .populate('createdBy', 'vendorName storeName contactNumber')
      .populate('approvedBy', 'name email')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    // For public access, only return approved and active products
    // In future, we can add authentication to allow vendors/admins to see their own products
    if (product.approvalStatus !== 'approved' || !product.isActive) {
      // Allow viewing if user is the vendor or admin (can be enhanced later)
      // For now, return 404 for non-approved products
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    // Apply offer discount to product (overrides salePrice if active offer exists)
    const productWithOffer = await applyOfferToProducts(product);

    logger.info(`Product retrieved by ID: ${id}`);

    res.status(200).json({
      success: true,
      data: productWithOffer,
    });
  } catch (error) {
    logger.error('Get product by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }
    next(error);
  }
};

/**
 * Scan QR code and check if product exists
 * Vendor ID is extracted from authentication credentials
 * Accepts productId (required) and sku (optional) in request body
 * Returns true if product exists and belongs to the authenticated vendor (and SKU matches if provided), false otherwise
 */
exports.scanQRCode = async (req, res, next) => {
  try {
    const { productId, sku } = req.body;
    const vendorId = req.vendor._id;

    // Validate productId is provided
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    // Find product by ID and filter by vendor at database level for security
    const product = await Product.findOne({
      _id: productId,
      vendor: vendorId
    })
      .select('_id skus isActive approvalStatus vendor')
      .lean();

    // Check if product exists and belongs to vendor
    if (!product) {
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Product not found or does not belong to this vendor',
      });
    }

    // Additional explicit verification - double check vendor ownership
    // Convert both to strings for reliable comparison
    const productVendorId = product.vendor?.toString();
    const authenticatedVendorId = vendorId.toString();

    if (productVendorId !== authenticatedVendorId) {
      logger.warn(`Vendor ownership mismatch detected: Product ${productId}, Expected vendor: ${authenticatedVendorId}, Product vendor: ${productVendorId}`);
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Product does not belong to this vendor',
      });
    }

    // If SKU is provided, check if it exists in the product's skus array
    if (sku) {
      const skuExists = product.skus && product.skus.some(
        (item) => item.sku && item.sku.trim().toLowerCase() === sku.trim().toLowerCase()
      );

      if (!skuExists) {
        return res.status(200).json({
          success: true,
          exists: false,
          message: 'Product found but SKU does not match',
        });
      }
    }

    // Product exists, belongs to vendor (and SKU matches if provided)
    return res.status(200).json({
      success: true,
      exists: true,
      message: 'Product exists',
    });
  } catch (error) {
    logger.error('Scan QR code error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }
    next(error);
  }
};
