const Product = require('../models/Product');
const { checkAndDisableExpiredOffer } = require('../utils/offerExpiryService');
const logger = require('../utils/logger');
const { calculateDistance, parseClientLatLon, toNumberCoord } = require('../utils/distanceUtils');

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
      .select('_id createdAt vendor category subCategory salePrice approvalStatus productNumber')
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
      productno: product.productNumber || null,
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
    const { radius = 10, page = 1, limit = 20, category, subCategory, search } = req.query;

    const parsed = parseClientLatLon(req.query);
    const hasLocation = !!parsed;
    const effectiveHasLocation = hasLocation;
    let userLat;
    let userLon;
    let searchRadius;

    if (hasLocation) {
      userLat = parsed.latitude;
      userLon = parsed.longitude;
      searchRadius = parseFloat(radius) || 10; // Default 10km radius
      if (parsed.corrected) {
        logger.info('getNearbyProducts: corrected client lat/lon order (South Asia heuristic)');
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
    if (effectiveHasLocation) {
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

    if (effectiveHasLocation) {
      // Calculate distance for each product and filter by user query radius OR vendor serviceRadius
      // Product will be shown if:
      // 1. Product location is within user's query radius, OR
      // 2. Vendor store is within user's query radius, OR
      // 3. User location is within vendor's serviceRadius (if vendorServiceRadius > 0)
      // This ensures products from ALL vendors within radius are returned, not just nearest vendor
      const productsWithDistance = products
        .map(product => {
          // Check if vendor exists and has storeAddress with coordinates
          if (!product.vendor || !product.vendor.storeAddress) {
            return null;
          }

          const vendorLat = toNumberCoord(product.vendor.storeAddress.latitude);
          const vendorLon = toNumberCoord(product.vendor.storeAddress.longitude);

          if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLon)) {
            return null;
          }

          const vendorServiceRadius = product.vendor.serviceRadius || 0;

          // Calculate distance from user location to vendor store location
          const vendorStoreDistance = calculateDistance(
            userLat,
            userLon,
            vendorLat,
            vendorLon
          );
          if (vendorStoreDistance == null) {
            return null;
          }

          // Calculate distance from user location to product location (if product has coordinates)
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

          // Product should be shown if ANY of these conditions are met:
          // 1. Product location is within user's query radius, OR
          // 2. Vendor store is within user's query radius
          let shouldShow = false;
          let displayDistance = null;

          // Check if product location is within user's query radius
          if (productDistance != null && productDistance <= searchRadius) {
            shouldShow = true;
            displayDistance = productDistance;
          }
          // Check if vendor store is within user's query radius
          else if (vendorStoreDistance <= searchRadius) {
            shouldShow = true;
            displayDistance = vendorStoreDistance;
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

      if (productsWithDistance.length > 0) {
        // Find the absolute nearest distance
        const nearestDistance = productsWithDistance[0].distance;

        // Filter products to only include those from the nearest vendor(s)
        // We use a small epsilon or just the first vendor's ID to be strict
        const nearestVendorId = productsWithDistance[0].vendor._id.toString();

        const filteredProducts = productsWithDistance.filter(
          product => product.vendor._id.toString() === nearestVendorId
        );

        total = filteredProducts.length;
        finalProducts = filteredProducts;
      } else {
        total = 0;
        finalProducts = [];
      }
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
 * Search products by name and location
 * Searches for products whose name contains the search term (case-insensitive)
 * Filters by nearby location based on latitude/longitude
 * Returns only approved and active products
 * Public endpoint - no authentication required
 */
exports.searchProductsByNameAndLocation = async (req, res, next) => {
  try {
    const { search, radius = 10, page = 1, limit = 20 } = req.query;

    const parsed = parseClientLatLon(req.query);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required (latitude & longitude, or lat & lng)',
      });
    }

    if (!search || search.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required',
      });
    }

    const userLat = parsed.latitude;
    const userLon = parsed.longitude;
    if (parsed.corrected) {
      logger.info('searchProductsByNameAndLocation: corrected client lat/lon order (South Asia heuristic)');
    }
    const searchRadius = parseFloat(radius) || 10; // Default 10km radius
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build query - only approved and active products
    // Search for products whose name contains the search term (case-insensitive)
    const query = {
      approvalStatus: 'approved',
      isActive: true,
      productName: { $regex: search.trim(), $options: 'i' }, // Case-insensitive regex search
    };

    // Get all products matching the search term
    const products = await Product.find(query)
      .populate('category', 'name categoryName')
      .populate('subCategory', 'name subCategoryName')
      .populate('vendor', 'vendorName storeName contactNumber serviceRadius storeAddress')
      .populate('createdBy', 'vendorName')
      .lean();

    // Calculate distance for each product and filter by location
    const productsWithDistance = products
      .map(product => {
        // Check if vendor exists and has storeAddress with coordinates
        if (!product.vendor || !product.vendor.storeAddress) {
          return null;
        }

        const vendorLat = toNumberCoord(product.vendor.storeAddress.latitude);
        const vendorLon = toNumberCoord(product.vendor.storeAddress.longitude);
        const vendorServiceRadius = product.vendor.serviceRadius || 0;

        if (!Number.isFinite(vendorLat) || !Number.isFinite(vendorLon)) {
          return null;
        }

        // Calculate distance from user location to vendor store location
        const vendorStoreDistance = calculateDistance(
          userLat,
          userLon,
          vendorLat,
          vendorLon
        );
        if (vendorStoreDistance == null) {
          return null;
        }

        // Calculate distance from user location to product location (if product has coordinates)
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

        // Product should be shown if EITHER:
        // 1. Product location is within user's query radius, OR
        // 2. Vendor store location is within user's query radius
        let shouldShow = false;
        let displayDistance = null;

        // Check if product location is within user's query radius
        if (productDistance != null && productDistance <= searchRadius) {
          shouldShow = true;
          displayDistance = productDistance;
        }
        // Check if vendor store location is within user's query radius
        else if (vendorStoreDistance <= searchRadius) {
          shouldShow = true;
          displayDistance = vendorStoreDistance;
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

    let finalProducts;
    let total;
    if (productsWithDistance.length > 0) {
      // Find the nearest vendor among those who have the searched product
      const nearestVendorId = productsWithDistance[0].vendor._id.toString();

      const filteredProducts = productsWithDistance.filter(
        product => product.vendor._id.toString() === nearestVendorId
      );

      finalProducts = filteredProducts;
      total = filteredProducts.length;
    } else {
      finalProducts = [];
      total = 0;
    }

    // Apply pagination
    const paginatedProducts = finalProducts.slice(skip, skip + limitNum);

    // Apply offer discounts to products (overrides salePrice if active offer exists)
    const productsWithOffers = await applyOfferToProducts(paginatedProducts);

    logger.info(`Product search: "${search}", Lat: ${userLat}, Lon: ${userLon}, Radius: ${searchRadius}km, Found: ${total}, Page: ${pageNum}`);

    res.status(200).json({
      success: true,
      count: productsWithOffers.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      search: search.trim(),
      location: {
        latitude: userLat,
        longitude: userLon,
        radius: searchRadius,
      },
      data: productsWithOffers,
    });
  } catch (error) {
    logger.error('Search products by name and location error:', error);
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
 * Get a single product by ID (Admin only)
 * Returns product regardless of approvalStatus or isActive status
 * Admin authentication required
 */
exports.getProductByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    // Find product by ID - no status filter for admin
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

    // Apply offer discount to product (overrides salePrice if active offer exists)
    const productWithOffer = await applyOfferToProducts(product);

    logger.info(`Product retrieved by ID (Admin): ${id} - Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      data: productWithOffer,
    });
  } catch (error) {
    logger.error('Get product by ID (Admin) error:', error);
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
