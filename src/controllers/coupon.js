const Coupon = require('../models/Coupon');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.createCoupon = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      couponName,
      offerId,
      offerType,
      code,
      minAmount,
      maxAmount,
      discountAmount,
      discountPercentage,
      appliedOn,
      categories,
      prepaidMinAmount,
      prepaidMaxAmount,
      prepaidDiscountPercentage,
      products,
      offerAmount,
      dateRange,
      timeRange,
      sendNotification,
      status,
      validFrom,
      validUntil,
      usageLimit,
    } = req.body;

    // Check if offerId already exists
    const existingOfferId = await Coupon.findOne({ offerId: offerId.toUpperCase() });
    if (existingOfferId) {
      return res.status(400).json({
        success: false,
        error: 'Offer ID already exists',
      });
    }

    // Check if code already exists
    const existingCode = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code already exists',
      });
    }

    // Validate discount fields based on offer type
    if (offerType === 'percentage' && !discountPercentage) {
      return res.status(400).json({
        success: false,
        error: 'Discount percentage is required for percentage type offers',
      });
    }

    if (offerType === 'fixed' && !discountAmount) {
      return res.status(400).json({
        success: false,
        error: 'Discount amount is required for fixed type offers',
      });
    }

    if (offerType === 'prepaid') {
      if (!prepaidDiscountPercentage) {
        return res.status(400).json({
          success: false,
          error: 'Prepaid discount percentage is required for prepaid offers',
        });
      }
      if (prepaidMinAmount && prepaidMaxAmount && prepaidMaxAmount <= prepaidMinAmount) {
        return res.status(400).json({
          success: false,
          error: 'Prepaid maximum amount must be greater than minimum amount',
        });
      }
    }

    if (offerType === 'today_offer') {
      if (!products || products.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one product is required for today\'s offer',
        });
      }
      if (!offerAmount) {
        return res.status(400).json({
          success: false,
          error: 'Offer amount is required for today\'s offer',
        });
      }
      if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
        return res.status(400).json({
          success: false,
          error: 'Date range is required for today\'s offer',
        });
      }
      if (!timeRange || !timeRange.startTime || !timeRange.endTime) {
        return res.status(400).json({
          success: false,
          error: 'Time range is required for today\'s offer',
        });
      }
    }

    // Validate appliedOn and categories
    if (appliedOn === 'select' && (!categories || categories.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one category is required when appliedOn is select',
      });
    }

    // Validate maxAmount is greater than minAmount if provided
    if (maxAmount && maxAmount <= minAmount) {
      return res.status(400).json({
        success: false,
        error: 'Maximum amount must be greater than minimum amount',
      });
    }

    // Validate date range
    if (validFrom && validUntil && new Date(validUntil) <= new Date(validFrom)) {
      return res.status(400).json({
        success: false,
        error: 'Valid until date must be after valid from date',
      });
    }

    const coupon = await Coupon.create({
      couponName,
      offerId: offerId.toUpperCase(),
      offerType,
      code: code.toUpperCase(),
      minAmount: parseFloat(minAmount),
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      discountAmount: discountAmount ? parseFloat(discountAmount) : undefined,
      discountPercentage: discountPercentage ? parseFloat(discountPercentage) : undefined,
      appliedOn: appliedOn || 'all',
      categories: appliedOn === 'select' && categories ? categories : undefined,
      prepaidMinAmount: prepaidMinAmount ? parseFloat(prepaidMinAmount) : undefined,
      prepaidMaxAmount: prepaidMaxAmount ? parseFloat(prepaidMaxAmount) : undefined,
      prepaidDiscountPercentage: prepaidDiscountPercentage ? parseFloat(prepaidDiscountPercentage) : undefined,
      products: offerType === 'today_offer' && products ? products : undefined,
      offerAmount: offerAmount ? parseFloat(offerAmount) : undefined,
      dateRange: dateRange ? {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      } : undefined,
      timeRange: timeRange ? {
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
      } : undefined,
      sendNotification: sendNotification !== undefined ? sendNotification : true,
      status: status || 'active',
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : undefined,
      usageLimit: usageLimit ? parseInt(usageLimit) : undefined,
      createdBy: req.admin ? req.admin._id : req.vendor._id,
      createdByModel: req.admin ? 'Admin' : 'Vendor',
    });

    const creatorInfo = req.admin ? `Admin: ${req.admin.email || req.admin._id}` : `Vendor: ${req.vendor.storeId || req.vendor._id}`;
    logger.info(`Coupon created: ${coupon.code} (Offer ID: ${coupon.offerId}) by ${creatorInfo}`);

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon,
    });
  } catch (error) {
    logger.error('Create coupon error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: `${field === 'offerId' ? 'Offer ID' : 'Coupon code'} already exists`,
      });
    }
    next(error);
  }
};

exports.getCoupons = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.offerType) {
      query.offerType = req.query.offerType;
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    if (req.query.search) {
      query.$or = [
        { code: { $regex: req.query.search, $options: 'i' } },
        { offerId: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'name email')
      .populate('categories', 'name')
      .populate('products', 'productName thumbnail')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Coupon.countDocuments(query);

    res.status(200).json({
      success: true,
      count: coupons.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: coupons,
    });
  } catch (error) {
    logger.error('Get coupons error:', error);
    next(error);
  }
};

exports.getCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('categories', 'name')
      .populate('products', 'productName thumbnail');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
    }

    res.status(200).json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    logger.error('Get coupon error:', error);
    next(error);
  }
};

exports.updateCoupon = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
    }

    const {
      couponName,
      offerId,
      offerType,
      code,
      minAmount,
      maxAmount,
      discountAmount,
      discountPercentage,
      appliedOn,
      categories,
      prepaidMinAmount,
      prepaidMaxAmount,
      prepaidDiscountPercentage,
      products,
      offerAmount,
      dateRange,
      timeRange,
      sendNotification,
      status,
      validFrom,
      validUntil,
      usageLimit,
      isActive,
    } = req.body;

    // Check if offerId already exists (excluding current coupon)
    if (offerId && offerId.toUpperCase() !== coupon.offerId) {
      const existingOfferId = await Coupon.findOne({
        offerId: offerId.toUpperCase(),
        _id: { $ne: coupon._id },
      });
      if (existingOfferId) {
        return res.status(400).json({
          success: false,
          error: 'Offer ID already exists',
        });
      }
      coupon.offerId = offerId.toUpperCase();
    }

    // Check if code already exists (excluding current coupon)
    if (code && code.toUpperCase() !== coupon.code) {
      const existingCode = await Coupon.findOne({
        code: code.toUpperCase(),
        _id: { $ne: coupon._id },
      });
      if (existingCode) {
        return res.status(400).json({
          success: false,
          error: 'Coupon code already exists',
        });
      }
      coupon.code = code.toUpperCase();
    }

    if (couponName) coupon.couponName = couponName;
    if (offerType) coupon.offerType = offerType;
    if (minAmount !== undefined) coupon.minAmount = parseFloat(minAmount);
    if (maxAmount !== undefined) {
      coupon.maxAmount = maxAmount ? parseFloat(maxAmount) : undefined;
    }
    if (discountAmount !== undefined) {
      coupon.discountAmount = discountAmount ? parseFloat(discountAmount) : undefined;
    }
    if (discountPercentage !== undefined) {
      coupon.discountPercentage = discountPercentage ? parseFloat(discountPercentage) : undefined;
    }
    if (appliedOn) coupon.appliedOn = appliedOn;
    if (categories !== undefined) {
      coupon.categories = appliedOn === 'select' && categories && categories.length > 0 ? categories : [];
    }
    if (prepaidMinAmount !== undefined) {
      coupon.prepaidMinAmount = prepaidMinAmount ? parseFloat(prepaidMinAmount) : undefined;
    }
    if (prepaidMaxAmount !== undefined) {
      coupon.prepaidMaxAmount = prepaidMaxAmount ? parseFloat(prepaidMaxAmount) : undefined;
    }
    if (prepaidDiscountPercentage !== undefined) {
      coupon.prepaidDiscountPercentage = prepaidDiscountPercentage ? parseFloat(prepaidDiscountPercentage) : undefined;
    }
    if (products !== undefined) {
      coupon.products = products && products.length > 0 ? products : [];
    }
    if (offerAmount !== undefined) {
      coupon.offerAmount = offerAmount ? parseFloat(offerAmount) : undefined;
    }
    if (dateRange) {
      coupon.dateRange = {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      };
    }
    if (timeRange) {
      coupon.timeRange = {
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
      };
    }
    if (sendNotification !== undefined) coupon.sendNotification = sendNotification;
    if (status) coupon.status = status;
    if (validFrom) coupon.validFrom = new Date(validFrom);
    if (validUntil) coupon.validUntil = validUntil ? new Date(validUntil) : undefined;
    if (usageLimit !== undefined) {
      coupon.usageLimit = usageLimit ? parseInt(usageLimit) : undefined;
    }
    if (isActive !== undefined) coupon.isActive = isActive === 'true' || isActive === true;

    coupon.updatedAt = new Date();

    // Validate maxAmount is greater than minAmount if provided
    if (coupon.maxAmount && coupon.maxAmount <= coupon.minAmount) {
      return res.status(400).json({
        success: false,
        error: 'Maximum amount must be greater than minimum amount',
      });
    }

    // Validate date range
    if (coupon.validFrom && coupon.validUntil && coupon.validUntil <= coupon.validFrom) {
      return res.status(400).json({
        success: false,
        error: 'Valid until date must be after valid from date',
      });
    }

    await coupon.save();

    logger.info(`Coupon updated: ${coupon.code} (Offer ID: ${coupon.offerId}) by Admin: ${req.admin.email || req.admin._id}`);

    const updatedCoupon = await Coupon.findById(coupon._id)
      .populate('createdBy', 'name email')
      .populate('categories', 'name')
      .populate('products', 'productName thumbnail');

    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      data: updatedCoupon,
    });
  } catch (error) {
    logger.error('Update coupon error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        error: `${field === 'offerId' ? 'Offer ID' : 'Coupon code'} already exists`,
      });
    }
    next(error);
  }
};

exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    logger.info(`Coupon deleted: ${coupon.code} (Offer ID: ${coupon.offerId}) by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    logger.error('Delete coupon error:', error);
    next(error);
  }
};

exports.toggleCouponStatus = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
    }

    coupon.isActive = !coupon.isActive;
    coupon.status = coupon.isActive ? 'active' : 'inactive';
    coupon.updatedAt = new Date();
    await coupon.save();

    const action = coupon.isActive ? 'activated' : 'deactivated';
    logger.info(`Coupon ${action}: ${coupon.code} (Offer ID: ${coupon.offerId}) by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: `Coupon ${action} successfully`,
      data: coupon,
    });
  } catch (error) {
    logger.error('Toggle coupon status error:', error);
    next(error);
  }
};

/**
 * Get available coupons for user
 * - Admin coupons: visible to all users if cart amount >= minAmount
 * - Vendor coupons: only visible to users who have purchased from that vendor AND cart amount >= minAmount
 */
exports.getAvailableCoupons = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const cartAmount = parseFloat(req.query.cartAmount) || 0;

    // Get user's cart to calculate subtotal if not provided
    let subtotal = cartAmount;
    if (!cartAmount || cartAmount === 0) {
      const Cart = require('../models/Cart');
      const cart = await Cart.findOne({ user: userId });
      if (cart && cart.items && cart.items.length > 0) {
        const totals = await cart.calculateTotals();
        subtotal = totals.pricing.subtotal || 0;
      }
    }

    // Get all active admin coupons (visible to all users)
    // Include coupons without createdByModel (backward compatibility - old coupons were admin-only)
    const adminCouponsQuery = {
      status: 'active',
      isActive: true,
      $or: [
        { createdByModel: 'Admin' },
        { createdByModel: { $exists: false } }, // Backward compatibility for old coupons
      ],
      minAmount: { $lte: subtotal }, // Cart amount must be >= minAmount
    };

    // Get user's past orders to find vendors they've purchased from
    const Order = require('../models/Order');
    const userOrders = await Order.find({ 
      user: userId,
      status: { $in: ['delivered', 'confirmed', 'processing', 'ready', 'out_for_delivery'] }
    }).select('items.vendor');

    // Extract unique vendor IDs from user's past orders
    const purchasedVendorIds = new Set();
    userOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.vendor) {
          purchasedVendorIds.add(item.vendor.toString());
        }
      });
    });

    // Get vendor coupons for vendors the user has purchased from
    const vendorCouponsQuery = {
      status: 'active',
      isActive: true,
      createdByModel: 'Vendor',
      minAmount: { $lte: subtotal }, // Cart amount must be >= minAmount
    };

    // If user has purchased from vendors, filter by those vendor IDs
    if (purchasedVendorIds.size > 0) {
      // Get vendor coupons created by vendors the user has purchased from
      const vendorCouponsPromise = Coupon.find({
        ...vendorCouponsQuery,
        createdBy: { $in: Array.from(purchasedVendorIds) },
      });

      // Get admin coupons
      const adminCouponsPromise = Coupon.find(adminCouponsQuery);

      // Execute both queries in parallel
      const [adminCoupons, vendorCoupons] = await Promise.all([
        adminCouponsPromise,
        vendorCouponsPromise,
      ]);

      // Combine and filter valid coupons
      const allCoupons = [...adminCoupons, ...vendorCoupons];
      
      // Filter coupons that are currently valid
      const validCoupons = allCoupons.filter(coupon => {
        if (!coupon.isValid()) {
          return false;
        }
        // Check if cart amount meets minimum requirement
        if (subtotal < coupon.minAmount) {
          return false;
        }
        return true;
      });

      // Remove duplicates (in case of edge cases)
      const uniqueCoupons = validCoupons.filter((coupon, index, self) =>
        index === self.findIndex(c => c._id.toString() === coupon._id.toString())
      );

      res.status(200).json({
        success: true,
        count: uniqueCoupons.length,
        data: uniqueCoupons,
      });
    } else {
      // User hasn't purchased from any vendor yet - only show admin coupons
      const adminCoupons = await Coupon.find(adminCouponsQuery);
      
      const validCoupons = adminCoupons.filter(coupon => {
        if (!coupon.isValid()) {
          return false;
        }
        if (subtotal < coupon.minAmount) {
          return false;
        }
        return true;
      });

      res.status(200).json({
        success: true,
        count: validCoupons.length,
        data: validCoupons,
      });
    }
  } catch (error) {
    logger.error('Get available coupons error:', error);
    next(error);
  }
};

