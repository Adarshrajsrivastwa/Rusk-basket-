const Product = require('../models/Product');
const Category = require('../models/Category');
const SubCategory = require('../models/SubCategory');
const mongoose = require('mongoose');
const { deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { validateCategoryAndSubCategory, uploadProductThumbnail, uploadProductImages, parseSKUs, parseTags, updateProductFields } = require('../services/productService');

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

exports.updateProduct = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    if (req.vendor && product.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own products',
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
      tags,
    } = req.body;

    if (category && subCategory) {
      try {
        await validateCategoryAndSubCategory(category, subCategory);
        product.category = category;
        product.subCategory = subCategory;
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError.message,
        });
      }
    } else if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(404).json({
          success: false,
          error: 'Category not found',
        });
      }
      product.category = category;
    } else if (subCategory) {
      const subCategoryExists = await SubCategory.findById(subCategory);
      if (!subCategoryExists) {
        return res.status(404).json({
          success: false,
          error: 'Sub category not found',
        });
      }
      if (product.category.toString() !== subCategoryExists.category.toString()) {
        return res.status(400).json({
          success: false,
          error: 'Sub category does not belong to the selected category',
        });
      }
      product.subCategory = subCategory;
    }

    updateProductFields(product, req.body);

    // Recalculate discount percentage if regularPrice or salePrice is updated
    // This ensures discount is calculated even before save (pre-save hook will also calculate it)
    if (req.body.regularPrice !== undefined || req.body.salePrice !== undefined) {
      const regularPrice = req.body.regularPrice !== undefined 
        ? parseFloat(req.body.regularPrice) 
        : product.regularPrice;
      const salePrice = req.body.salePrice !== undefined 
        ? parseFloat(req.body.salePrice) 
        : product.salePrice;
      product.discountPercentage = calculateDiscountPercentage(regularPrice, salePrice);
    } else if (product.isModified('regularPrice') || product.isModified('salePrice')) {
      // If prices were modified through updateProductFields, recalculate
      product.discountPercentage = calculateDiscountPercentage(product.regularPrice, product.salePrice);
    }

    if (skus !== undefined) {
      try {
        const parsedSkus = parseSKUs(skus);
        for (const skuItem of parsedSkus) {
          if (!skuItem.sku || typeof skuItem.inventory !== 'number' || skuItem.inventory < 0) {
            return res.status(400).json({
              success: false,
              error: 'Each SKU must have a valid sku string and non-negative inventory number',
            });
          }
        }
        product.skus = parsedSkus;
        if (parsedSkus.length > 0) {
          product.inventory = parsedSkus.reduce((sum, sku) => sum + sku.inventory, 0);
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: parseError.message,
        });
      }
    } else if (inventory !== undefined) {
      product.inventory = parseFloat(inventory);
    }

    if (tags !== undefined) {
      try {
        product.tags = parseTags(tags);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: parseError.message,
        });
      }
    }

    if (req.files) {
      if (req.files.thumbnail) {
        const newThumbnail = await uploadProductThumbnail(req.files);
        if (newThumbnail) {
          if (product.thumbnail && product.thumbnail.publicId) {
            await deleteFromCloudinary(product.thumbnail.publicId);
          }
          product.thumbnail = newThumbnail;
        }
      }

      if (req.files.images && req.files.images.length > 0) {
        const newImages = await uploadProductImages(req.files);
        if (newImages && newImages.length > 0) {
          product.images = [...(product.images || []), ...newImages];
        }
      }
    }

    if (req.admin) {
      product.updatedBy = req.admin._id;
      product.updatedByModel = 'Admin';
      // When admin updates product, reset to pending status for re-approval
      product.approvalStatus = 'pending';
      product.approvedBy = undefined;
      product.approvedAt = undefined;
      product.rejectionReason = undefined;
    } else if (req.vendor) {
      product.updatedBy = req.vendor._id;
      product.updatedByModel = 'Vendor';
      // When vendor updates product, always reset to pending status for re-approval
      product.approvalStatus = 'pending';
      product.approvedBy = undefined;
      product.approvedAt = undefined;
      product.rejectionReason = undefined;
    }

    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .populate('createdBy', 'vendorName')
      .populate('updatedBy', 'name vendorName')
      .populate('approvedBy', 'name email')
      .lean();

    // Add discount percentage to product
    const productWithDiscount = {
      ...populatedProduct,
      discountPercentage: calculateDiscountPercentage(populatedProduct.regularPrice, populatedProduct.salePrice),
    };

    logger.info(`Product updated: ${product.productName} by ${req.admin ? 'Admin' : 'Vendor'}: ${req.admin?.email || req.vendor?.vendorName || req.vendor?.contactNumber}`);

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: productWithDiscount,
    });
  } catch (error) {
    logger.error('Update product error:', error);
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    // Ensure vendor can only delete their own products
    if (req.vendor && product.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own products',
      });
    }

    // If admin is deleting, allow it (for future admin delete functionality)
    if (req.admin) {
      // Admin can delete any product
    } else if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only vendors can delete products.',
      });
    }

    // Delete images from Cloudinary
    const deletePromises = [];
    if (product.thumbnail && product.thumbnail.publicId) {
      deletePromises.push(deleteFromCloudinary(product.thumbnail.publicId));
    }
    if (product.images && product.images.length > 0) {
      product.images.forEach((image) => {
        if (image.publicId) {
          deletePromises.push(deleteFromCloudinary(image.publicId));
        }
      });
    }
    
    // Delete all images (don't fail if some deletions fail)
    await Promise.allSettled(deletePromises);

    // Delete the product from database
    await Product.findByIdAndDelete(req.params.id);

    logger.info(`Product deleted: ${product.productName} (ID: ${product._id}) by ${req.admin ? 'Admin' : 'Vendor'}: ${req.admin?.email || req.vendor?.vendorName || req.vendor?.contactNumber}`);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      data: {
        productId: product._id,
        productName: product.productName,
      },
    });
  } catch (error) {
    logger.error('Delete product error:', error);
    next(error);
  }
};


