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
      skus,
      inventory,
      actualPrice,
      regularPrice,
      salePrice,
      cashback,
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

    if (!thumbnail) {
      return res.status(400).json({
        success: false,
        error: 'Product thumbnail is required',
      });
    }

    let parsedSkus = [];
    try {
      parsedSkus = parseSKUs(skus);
      for (const skuItem of parsedSkus) {
        if (!skuItem.sku || typeof skuItem.inventory !== 'number' || skuItem.inventory < 0) {
          return res.status(400).json({
            success: false,
            error: 'Each SKU must have a valid sku string and non-negative inventory number',
          });
        }
      }
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: parseError.message,
      });
    }

    let totalInventory = inventory;
    if (parsedSkus.length > 0) {
      totalInventory = parsedSkus.reduce((sum, sku) => sum + sku.inventory, 0);
    }

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
      images: images || [],
      description,
      skus: parsedSkus,
      inventory: totalInventory,
      actualPrice: parseFloat(actualPrice),
      regularPrice: parseFloat(regularPrice),
      salePrice: salePrice ? parseFloat(salePrice) : undefined,
      cashback: cashback ? parseFloat(cashback) : 0,
      vendor: req.vendor._id,
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
      message: 'Product created successfully. Waiting for super admin approval.',
      data: populatedProduct,
    });
  } catch (error) {
    logger.error('Add product error:', error);
    next(error);
  }
};

