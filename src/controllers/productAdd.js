const Product = require('../models/Product');
const { deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { validateCategoryAndSubCategory, uploadProductThumbnail, uploadProductImages, parseSKUs } = require('../services/productService');

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
      actualPrice: parseFloat(actualPrice),
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      cashback: cashback ? parseFloat(cashback) : 0,
      tags: parsedTags,
      vendor: req.vendor._id,
      latitude: vendorLatitude || undefined,
      longitude: vendorLongitude || undefined,
      createdBy: req.vendor._id,
      approvalStatus: 'pending',
    });

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName');

    logger.info(`Product created: ${product.productName} by Vendor: ${req.vendor.vendorName || req.vendor.contactNumber}`);

    res.status(201).json({
      success: true,
      message: 'Product created successfully. Waiting for admin approval.',
      data: populatedProduct,
    });
  } catch (error) {
    logger.error('Add product error:', error);
    next(error);
  }
};

