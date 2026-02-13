const DailyOrder = require('../models/DailyOrder');
const User = require('../models/User');
const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Create or update daily order
 */
exports.createOrUpdateDailyOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const {
      items,
      shippingAddress,
      deliveryTime,
      daysOfWeek,
      startDate,
      endDate,
      isActive,
      notes,
    } = req.body;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items are required and must be a non-empty array',
      });
    }

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.line1 || !shippingAddress.pinCode || !shippingAddress.city || !shippingAddress.state || !shippingAddress.phone) {
      return res.status(400).json({
        success: false,
        error: 'Complete shipping address is required (line1, pinCode, city, state, phone)',
      });
    }

    // Validate days of week
    if (!daysOfWeek || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Days of week are required and must be a non-empty array',
      });
    }

    // Validate and populate product/vendor details for items
    const validatedItems = [];
    for (const item of items) {
      if (!item.productId || !item.quantity) {
        return res.status(400).json({
          success: false,
          error: 'Each item must have productId and quantity',
        });
      }

      const product = await Product.findById(item.productId)
        .populate('vendor', 'vendorName storeName')
        .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product with ID ${item.productId} not found`,
        });
      }

      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          error: `Product ${product.productName} is not active`,
        });
      }

      if (product.inventory < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient inventory for product ${product.productName}. Available: ${product.inventory}, Requested: ${item.quantity}`,
        });
      }

      validatedItems.push({
        product: product._id,
        vendor: product.vendor || product.createdBy,
        productName: product.productName,
        quantity: item.quantity,
        unitPrice: product.regularPrice || 0,
        salePrice: product.salePrice || 0,
        sku: item.sku || (product.skus && product.skus.length > 0 ? product.skus[0].sku : ''),
      });
    }

    // Check if daily order already exists for this user
    let dailyOrder = await DailyOrder.findOne({ user: userId, isActive: true });

    if (dailyOrder) {
      // Update existing daily order
      dailyOrder.items = validatedItems;
      dailyOrder.shippingAddress = shippingAddress;
      dailyOrder.deliveryTime = deliveryTime || dailyOrder.deliveryTime;
      dailyOrder.daysOfWeek = daysOfWeek;
      dailyOrder.startDate = startDate ? new Date(startDate) : dailyOrder.startDate;
      dailyOrder.endDate = endDate ? new Date(endDate) : null;
      dailyOrder.isActive = isActive !== undefined ? isActive : dailyOrder.isActive;
      dailyOrder.notes = notes || dailyOrder.notes;
      
      await dailyOrder.save();

      logger.info(`Daily order updated for user: ${userId}`);

      const populatedOrder = await DailyOrder.findById(dailyOrder._id)
        .populate('user', 'userName contactNumber email')
        .populate('items.product', 'productName thumbnail')
        .populate('items.vendor', 'vendorName storeName')
        .lean();

      return res.status(200).json({
        success: true,
        message: 'Daily order updated successfully',
        data: populatedOrder,
      });
    } else {
      // Create new daily order
      dailyOrder = new DailyOrder({
        user: userId,
        items: validatedItems,
        shippingAddress,
        deliveryTime,
        daysOfWeek,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        isActive: isActive !== undefined ? isActive : true,
        notes,
      });

      await dailyOrder.save();

      logger.info(`Daily order created for user: ${userId}`);

      const populatedOrder = await DailyOrder.findById(dailyOrder._id)
        .populate('user', 'userName contactNumber email')
        .populate('items.product', 'productName thumbnail')
        .populate('items.vendor', 'vendorName storeName')
        .lean();

      return res.status(201).json({
        success: true,
        message: 'Daily order created successfully',
        data: populatedOrder,
      });
    }
  } catch (error) {
    logger.error('Create/Update daily order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create/update daily order',
      message: error.message,
    });
  }
};

/**
 * Get daily order for authenticated user
 */
exports.getDailyOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const dailyOrder = await DailyOrder.findOne({ user: userId, isActive: true })
      .populate('user', 'userName contactNumber email')
      .populate('items.product', 'productName thumbnail description salePrice regularPrice inventory')
      .populate('items.vendor', 'vendorName storeName contactNumber')
      .lean();

    if (!dailyOrder) {
      return res.status(404).json({
        success: false,
        error: 'No active daily order found',
      });
    }

    res.status(200).json({
      success: true,
      data: dailyOrder,
    });
  } catch (error) {
    logger.error('Get daily order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily order',
    });
  }
};

/**
 * Deactivate daily order
 */
exports.deactivateDailyOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const dailyOrder = await DailyOrder.findOne({ user: userId, isActive: true });

    if (!dailyOrder) {
      return res.status(404).json({
        success: false,
        error: 'No active daily order found',
      });
    }

    dailyOrder.isActive = false;
    await dailyOrder.save();

    logger.info(`Daily order deactivated for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Daily order deactivated successfully',
    });
  } catch (error) {
    logger.error('Deactivate daily order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate daily order',
    });
  }
};
