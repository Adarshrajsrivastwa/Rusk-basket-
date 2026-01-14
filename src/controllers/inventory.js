const Product = require('../models/Product');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.updateInventory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

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

    if (product.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only update inventory for your own products',
      });
    }

    const { inventory, skus, action } = req.body;

    const previousInventory = product.inventory;
    const previousSkus = JSON.parse(JSON.stringify(product.skus || []));

    if (skus !== undefined && Array.isArray(skus) && skus.length > 0) {
      for (const skuItem of skus) {
        if (!skuItem.sku || typeof skuItem.inventory !== 'number' || skuItem.inventory < 0) {
          return res.status(400).json({
            success: false,
            error: 'Each SKU must have a valid sku string and non-negative inventory number',
          });
        }
      }

      if (action === 'add' || action === 'subtract') {
        const updatedSkus = product.skus.map((existingSku) => {
          const newSku = skus.find((s) => s.sku === existingSku.sku);
          if (newSku) {
            if (action === 'add') {
              return {
                ...existingSku.toObject(),
                inventory: existingSku.inventory + newSku.inventory,
              };
            } else if (action === 'subtract') {
              const newInventory = existingSku.inventory - newSku.inventory;
              if (newInventory < 0) {
                throw new Error(`Cannot subtract ${newSku.inventory} from SKU ${existingSku.sku}. Current inventory: ${existingSku.inventory}`);
              }
              return {
                ...existingSku.toObject(),
                inventory: newInventory,
              };
            }
          }
          return existingSku;
        });

        skus.forEach((newSku) => {
          const exists = updatedSkus.some((s) => s.sku === newSku.sku);
          if (!exists) {
            if (action === 'add') {
              updatedSkus.push(newSku);
            } else {
              return res.status(400).json({
                success: false,
                error: `Cannot subtract from non-existent SKU: ${newSku.sku}`,
              });
            }
          }
        });

        product.skus = updatedSkus;
        product.inventory = updatedSkus.reduce((sum, sku) => sum + sku.inventory, 0);
      } else {
        product.skus = skus;
        product.inventory = skus.reduce((sum, sku) => sum + sku.inventory, 0);
      }
    } else if (inventory !== undefined) {
      const inventoryValue = parseFloat(inventory);

      if (isNaN(inventoryValue) || inventoryValue < 0) {
        return res.status(400).json({
          success: false,
          error: 'Inventory must be a valid non-negative number',
        });
      }

      if (action === 'add') {
        product.inventory = (product.inventory || 0) + inventoryValue;
      } else if (action === 'subtract') {
        const newInventory = (product.inventory || 0) - inventoryValue;
        if (newInventory < 0) {
          return res.status(400).json({
            success: false,
            error: `Cannot subtract ${inventoryValue}. Current inventory: ${product.inventory}`,
          });
        }
        product.inventory = newInventory;
      } else {
        product.inventory = inventoryValue;
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either inventory or skus must be provided',
      });
    }

    product.updatedAt = Date.now();

    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'vendorName storeName')
      .select('-__v')
      .lean();

    logger.info(`Inventory updated for product: ${product.productName} (ID: ${product._id}) by Vendor: ${req.vendor?.vendorName || req.vendor?.contactNumber || req.vendor._id}. Previous: ${previousInventory}, New: ${product.inventory}`);

    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      data: {
        product: populatedProduct,
        inventory: {
          previous: previousInventory,
          current: product.inventory,
          change: product.inventory - previousInventory,
        },
        skus: product.skus || [],
      },
    });
  } catch (error) {
    logger.error('Update inventory error:', error);
    
    if (error.message && error.message.includes('Cannot subtract')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update inventory',
    });
  }
};

exports.getInventory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID format',
      });
    }

    const product = await Product.findById(req.params.id)
      .select('productName inventory skus vendor')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    if (product.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You can only view inventory for your own products',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        productId: product._id,
        productName: product.productName,
        inventory: product.inventory || 0,
        skus: product.skus || [],
        totalSkuInventory: (product.skus || []).reduce((sum, sku) => sum + (sku.inventory || 0), 0),
      },
    });
  } catch (error) {
    logger.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory',
    });
  }
};

exports.getAllInventory = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const { page = 1, limit = 20, search } = req.query;

    const query = {
      vendor: vendorId,
      isActive: true,
    };

    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(query)
      .select('productName inventory skus approvalStatus isActive')
      .sort({ productName: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    const inventoryData = products.map((product) => ({
      productId: product._id,
      productName: product.productName,
      inventory: product.inventory || 0,
      skus: product.skus || [],
      totalSkuInventory: (product.skus || []).reduce((sum, sku) => sum + (sku.inventory || 0), 0),
      approvalStatus: product.approvalStatus,
      isActive: product.isActive,
    }));

    res.status(200).json({
      success: true,
      data: {
        products: inventoryData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalProducts: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get all inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory',
    });
  }
};
