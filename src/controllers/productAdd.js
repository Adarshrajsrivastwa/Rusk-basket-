const Product = require('../models/Product');
const { deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { validateCategoryAndSubCategory, uploadProductThumbnail, uploadProductImages, parseSKUs } = require('../services/productService');

/**
 * Calculate discount percentage based on regular price and sale price
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

exports.addProduct = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      productName,
      productType,
      productTypeValue,
      productTypeUnit,
      category,
      subCategory,
      description,
      skuHsn,
      inventory,
      actualPrice,
      regularPrice,
      salePrice,
      cashback,
      tags,
    } = req.body;

    try {
      await validateCategoryAndSubCategory(category, subCategory);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError.message,
      });
    }

    const thumbnail = await uploadProductThumbnail(req.files);
    const images = await uploadProductImages(req.files);

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one product image is required',
      });
    }

    // Parse tags from comma-separated string
    let parsedTags = [];
    if (tags) {
      parsedTags = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
      if (parsedTags.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one tag is required',
        });
      }
      if (parsedTags.length > 20) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 20 tags allowed',
        });
      }
    }

    // Calculate inventory (default to 0 if not provided)
    let totalInventory = inventory ? parseFloat(inventory) : 0;

    // Calculate discount percentage
    const parsedRegularPrice = parseFloat(regularPrice);
    const parsedSalePrice = parseFloat(salePrice);
    const calculatedDiscount = calculateDiscountPercentage(parsedRegularPrice, parsedSalePrice);

    // Get vendor's location from storeAddress
    const vendorLatitude = req.vendor.storeAddress?.latitude;
    const vendorLongitude = req.vendor.storeAddress?.longitude;

    const product = await Product.create({
      productName,
      productType: {
        type: productType,
        value: parseFloat(productTypeValue),
        unit: productTypeUnit,
      },
      category,
      subCategory,
      thumbnail,
      images: images,
      description: description || undefined,
      skuHsn: skuHsn || undefined,
      inventory: totalInventory,
      initialInventory: totalInventory, // Track initial inventory for stock percentage calculation
      actualPrice: parseFloat(actualPrice),
      regularPrice: parsedRegularPrice,
      salePrice: parsedSalePrice,
      discountPercentage: calculatedDiscount,
      cashback: cashback ? parseFloat(cashback) : 0,
      tags: parsedTags,
      vendor: req.vendor._id,
      latitude: vendorLatitude || undefined,
      longitude: vendorLongitude || undefined,
      createdBy: req.vendor._id,
      approvalStatus: 'pending',
    });

    // Get total products count for this vendor
    const totalProducts = await Product.countDocuments({
      vendor: req.vendor._id,
      isActive: true,
    });

    // Calculate stock status
    // Out of stock: inventory = 0
    // Low stock: inventory > 0 and less than 20% of initial inventory
    // At creation, initialInventory = inventory, so we check if inventory is very low
    let stockStatus = 'in_stock';
    if (totalInventory === 0) {
      stockStatus = 'out_of_stock';
    } else if (totalInventory > 0 && totalInventory < 10) {
      // If inventory is very low at creation (< 10 units), consider it low stock
      // This will be properly calculated when stock is updated using initialInventory percentage
      stockStatus = 'low_stock';
    }

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName')
      .lean();

    // Add discount percentage and stock status to product
    const productWithDiscount = {
      ...populatedProduct,
      discountPercentage: calculateDiscountPercentage(populatedProduct.regularPrice, populatedProduct.salePrice),
      stockStatus: stockStatus,
    };

    logger.info(`Product created: ${product.productName} by Vendor: ${req.vendor.vendorName || req.vendor.contactNumber}`);

    res.status(201).json({
      success: true,
      message: 'Product created successfully. Waiting for admin approval.',
      data: productWithDiscount,
      totalProductsAdded: totalProducts,
    });
  } catch (error) {
    logger.error('Add product error:', error);
    next(error);
  }
};

