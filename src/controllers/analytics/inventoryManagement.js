const { validationResult } = require('express-validator');
const Product = require('../../models/Product');
const logger = require('../../utils/logger');

/**
 * Update product inventory (Vendor only)
 * Updates inventory and initialInventory based on added product quantity
 * initialInventory = current inventory + addedProduct
 * inventory = initialInventory (both become equal)
 */
exports.updateStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { productId } = req.params;
    const { addedProduct } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }

    if (addedProduct === undefined || addedProduct === null) {
      return res.status(400).json({
        success: false,
        error: 'Added product quantity is required',
      });
    }

    const addedProductNum = parseFloat(addedProduct);
    if (isNaN(addedProductNum) || addedProductNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Added product quantity must be a valid non-negative number',
      });
    }

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    // Only vendor can update, and only their own products
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can update inventory',
      });
    }

    // Check if vendor owns this product
    if (product.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own products',
      });
    }

    // Get current inventory
    const previousInventory = product.inventory || 0;
    const currentInventory = previousInventory;

    // Calculate initialInventory = current inventory + added product
    const newInitialInventory = currentInventory + addedProductNum;

    // Update both inventory and initialInventory to be equal
    product.initialInventory = newInitialInventory;
    product.inventory = newInitialInventory;

    // Calculate stock status based on percentage
    let stockStatus = 'in_stock';
    const initialInv = product.initialInventory;
    
    if (product.inventory === 0) {
      stockStatus = 'out_of_stock';
    } else if (initialInv > 0 && product.inventory < (initialInv * 0.2)) {
      // If current inventory is less than 20% of initial inventory
      stockStatus = 'low_stock';
    }

    await product.save();

    // Get updated product with populated fields
    const updatedProduct = await Product.findById(productId)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .lean();

    // Get total products count for the vendor
    const totalProducts = await Product.countDocuments({
      vendor: product.vendor,
      isActive: true,
    });

    logger.info(`Inventory updated for product: ${product.productName}, Previous: ${previousInventory}, Added: ${addedProductNum}, New: ${newInitialInventory}`);

    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      data: {
        ...updatedProduct,
        stockStatus: stockStatus,
        previousInventory: previousInventory,
        addedProduct: addedProductNum,
        currentInventory: product.inventory,
        initialInventory: product.initialInventory,
      },
      totalProductsAdded: totalProducts,
    });
  } catch (error) {
    logger.error('Update inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update inventory',
      message: error.message,
    });
  }
};

/**
 * Get inventory for a specific product
 */
exports.getProductInventory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required',
      });
    }

    // Find the product
    const product = await Product.findById(productId)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    // Check permissions: Admin can view any product, Vendor can only view their own
    if (req.vendor && !req.admin) {
      if (product.vendor._id.toString() !== req.vendor._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this product inventory',
        });
      }
    }

    // Calculate stock status
    let stockStatus = 'in_stock';
    const currentInventory = product.inventory || 0;
    const initialInv = product.initialInventory || currentInventory;

    if (currentInventory === 0) {
      stockStatus = 'out_of_stock';
    } else if (initialInv > 0 && currentInventory < (initialInv * 0.2)) {
      stockStatus = 'low_stock';
    }

    // Calculate stock percentage
    const stockPercentage = initialInv > 0 
      ? ((currentInventory / initialInv) * 100).toFixed(2)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        productId: product._id,
        productName: product.productName,
        skuHsn: product.skuHsn,
        currentInventory: currentInventory,
        initialInventory: initialInv,
        stockStatus: stockStatus,
        stockPercentage: parseFloat(stockPercentage),
        skus: product.skus || [],
        vendor: product.vendor,
        category: product.category,
        subCategory: product.subCategory,
      },
    });
  } catch (error) {
    logger.error('Get product inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product inventory',
      message: error.message,
    });
  }
};

/**
 * Get inventory for all products (vendor's products or all products for admin)
 */
exports.getAllInventory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { page = 1, limit = 20, stockStatus: filterStockStatus } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { isActive: true };

    // If vendor, only show their products
    if (req.vendor && !req.admin) {
      query.vendor = req.vendor._id;
    }

    // Get products
    const products = await Product.find(query)
      .select('productName skuHsn inventory initialInventory skus vendor category subCategory')
      .populate('vendor', 'vendorName storeName')
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

      console.log(products);

    // Calculate stock status for each product
    const inventoryData = products.map((product) => {
      const currentInventory = product.inventory || 0;
      const initialInv = product.initialInventory || currentInventory;

      let stockStatus = 'in_stock';
      if (currentInventory === 0) {
        stockStatus = 'out_of_stock';
      } else if (initialInv > 0 && currentInventory < (initialInv * 0.2)) {
        stockStatus = 'low_stock';
      }

      const stockPercentage = initialInv > 0 
        ? ((currentInventory / initialInv) * 100).toFixed(2)
        : 0;

      return {
        productId: product._id,
        productName: product.productName,
        skuHsn: product.skuHsn,
        currentInventory: currentInventory,
        initialInventory: initialInv,
        stockStatus: stockStatus,
        stockPercentage: parseFloat(stockPercentage),
        skus: product.skus || [],
        vendor: product.vendor,
        category: product.category,
        subCategory: product.subCategory,
      };
    });

    // Filter by stock status if provided
    let filteredData = inventoryData;
    if (filterStockStatus && ['out_of_stock', 'low_stock', 'in_stock'].includes(filterStockStatus)) {
      filteredData = inventoryData.filter(item => item.stockStatus === filterStockStatus);
    }

    // Get total count
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limitNum);

    // Get summary statistics
    const allProductsForStats = await Product.find(query)
      .select('inventory initialInventory')
      .lean();

    const stats = {
      totalProducts: totalProducts,
      outOfStock: 0,
      lowStock: 0,
      inStock: 0,
      totalInventory: 0,
      totalInitialInventory: 0,
    };

    allProductsForStats.forEach((product) => {
      const currentInventory = product.inventory || 0;
      const initialInv = product.initialInventory || currentInventory;

      stats.totalInventory += currentInventory;
      stats.totalInitialInventory += initialInv;

      if (currentInventory === 0) {
        stats.outOfStock++;
      } else if (initialInv > 0 && currentInventory < (initialInv * 0.2)) {
        stats.lowStock++;
      } else {
        stats.inStock++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        inventory: filteredData,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalProducts: totalProducts,
          limit: limitNum,
        },
        summary: stats,
      },
    });
  } catch (error) {
    logger.error('Get all inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory',
      message: error.message,
    });
  }
};

/**
 * Get vendor products list with inventory details - Table format
 * Returns products in a format suitable for table display
 */
exports.getVendorProductsList = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { 
      page = 1, 
      limit = 20, 
      stockStatus, 
      approvalStatus,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {
      vendor: vendorId,
      isActive: true,
    };

    // Filter by approval status
    if (approvalStatus && ['pending', 'approved', 'rejected'].includes(approvalStatus)) {
      query.approvalStatus = approvalStatus;
    }

    // Search by product name
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Sort options
    const sortOptions = {};
    const validSortFields = ['createdAt', 'productName', 'inventory', 'salePrice', 'regularPrice'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Get products
    const products = await Product.find(query)
      .select('productName skuHsn inventory initialInventory skus category subCategory salePrice regularPrice actualPrice approvalStatus isActive createdAt thumbnail')
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate stock status and format data for table
    const tableData = products.map((product, index) => {
      // Use inventory directly from product schema
      const inventory = product.inventory !== undefined && product.inventory !== null ? product.inventory : 0;
      const initialInv = product.initialInventory !== undefined && product.initialInventory !== null ? product.initialInventory : inventory;

      let stockStatus = 'in_stock';
      let stockStatusLabel = 'In Stock';
      
      if (inventory === 0) {
        stockStatus = 'out_of_stock';
        stockStatusLabel = 'Out of Stock';
      } else if (initialInv > 0 && inventory < (initialInv * 0.2)) {
        stockStatus = 'low_stock';
        stockStatusLabel = 'Low Stock';
      }

      const stockPercentage = initialInv > 0 
        ? ((inventory / initialInv) * 100).toFixed(2)
        : 0;

      // Format approval status
      let statusLabel = product.approvalStatus || 'pending';
      statusLabel = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);

      // Get subcategory name from populated subCategory reference
      // subCategory is an ObjectId reference that gets populated with 'name' field
      let subCategoryName = 'N/A';
      if (product.subCategory) {
        // After populate('subCategory', 'name'), it should be an object like { _id: ObjectId, name: 'SubCategoryName' }
        if (product.subCategory && typeof product.subCategory === 'object' && product.subCategory.name) {
          subCategoryName = product.subCategory.name;
        }
        // If subCategory is null, undefined, or not populated properly, it will remain 'N/A'
      }

      return {
        n: skip + index + 1, // Row number
        productId: product._id,
        productName: product.productName,
        category: product.category?.name || 'N/A',
        subCategory: subCategoryName, // Subcategory name
        inventory: inventory, // Inventory from product schema
        stock: inventory,
        stockStatus: stockStatus,
        stockStatusLabel: stockStatusLabel,
        stockPercentage: parseFloat(stockPercentage),
        initialInventory: initialInv,
        price: product.salePrice || product.regularPrice || 0,
        regularPrice: product.regularPrice || 0, // Regular price of product
        salePrice: product.salePrice || 0, // Sale price
        actualPrice: product.actualPrice || 0,
        vendor: product.vendor?.vendorName || 'N/A',
        vendorId: product.vendor?._id || null,
        expiryDate: null, // Expiry date field - can be added to Product model later
        status: statusLabel,
        approvalStatus: product.approvalStatus,
        isActive: product.isActive,
        skuHsn: product.skuHsn || 'N/A',
        thumbnail: product.thumbnail?.url || null,
        createdAt: product.createdAt,
      };
    });

    // Filter by stock status if provided
    let filteredData = tableData;
    if (stockStatus && ['out_of_stock', 'low_stock', 'in_stock'].includes(stockStatus)) {
      filteredData = tableData.filter(item => item.stockStatus === stockStatus);
    }

    // Get total count
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limitNum);

    // Get summary statistics
    const allProductsForStats = await Product.find({ vendor: vendorId, isActive: true })
      .select('inventory initialInventory approvalStatus')
      .lean();

    const stats = {
      totalProducts: totalProducts,
      approved: 0,
      pending: 0,
      rejected: 0,
      outOfStock: 0,
      lowStock: 0,
      inStock: 0,
      totalInventory: 0,
    };

    allProductsForStats.forEach((product) => {
      const currentInventory = product.inventory || 0;
      const initialInv = product.initialInventory || currentInventory;

      stats.totalInventory += currentInventory;

      // Approval status count
      if (product.approvalStatus === 'approved') stats.approved++;
      else if (product.approvalStatus === 'pending') stats.pending++;
      else if (product.approvalStatus === 'rejected') stats.rejected++;

      // Stock status count
      if (currentInventory === 0) {
        stats.outOfStock++;
      } else if (initialInv > 0 && currentInventory < (initialInv * 0.2)) {
        stats.lowStock++;
      } else {
        stats.inStock++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        products: filteredData,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalProducts: totalProducts,
          limit: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
        summary: stats,
      },
    });
  } catch (error) {
    logger.error('Get vendor products list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor products list',
      message: error.message,
    });
  }
};
