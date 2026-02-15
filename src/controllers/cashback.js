const CashbackSettings = require('../models/CashbackSettings');
const CashbackTransaction = require('../models/CashbackTransaction');
const PendingCashback = require('../models/PendingCashback');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * ============================================
 * ADMIN ENDPOINTS
 * ============================================
 */

/**
 * Get cashback settings (Admin only)
 */
exports.getCashbackSettings = async (req, res, next) => {
  try {
    const settings = await CashbackSettings.getSettings();
    
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Get cashback settings error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get cashback settings',
    });
  }
};

/**
 * Update cashback settings (Admin only)
 */
exports.updateCashbackSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const {
      cashbackPercentage,
      minimumOrderAmount,
      maximumCashbackPerOrder,
      minimumCashbackToUse,
      maxCashbackUsagePercentage,
      maxCashbackUsageAmount,
      isActive,
    } = req.body;

    let settings = await CashbackSettings.findOne();
    
    if (!settings) {
      settings = await CashbackSettings.create({
        cashbackPercentage: cashbackPercentage || 5,
        minimumOrderAmount: minimumOrderAmount || 100,
        maximumCashbackPerOrder: maximumCashbackPerOrder || 0,
        minimumCashbackToUse: minimumCashbackToUse || 50,
        maxCashbackUsagePercentage: maxCashbackUsagePercentage || 20,
        maxCashbackUsageAmount: maxCashbackUsageAmount || 0,
        isActive: isActive !== undefined ? isActive : true,
        updatedBy: req.admin._id,
      });
    } else {
      if (cashbackPercentage !== undefined) {
        settings.cashbackPercentage = cashbackPercentage;
      }
      if (minimumOrderAmount !== undefined) {
        settings.minimumOrderAmount = minimumOrderAmount;
      }
      if (maximumCashbackPerOrder !== undefined) {
        settings.maximumCashbackPerOrder = maximumCashbackPerOrder;
      }
      if (minimumCashbackToUse !== undefined) {
        settings.minimumCashbackToUse = minimumCashbackToUse;
      }
      if (maxCashbackUsagePercentage !== undefined) {
        settings.maxCashbackUsagePercentage = maxCashbackUsagePercentage;
      }
      if (maxCashbackUsageAmount !== undefined) {
        settings.maxCashbackUsageAmount = maxCashbackUsageAmount;
      }
      if (isActive !== undefined) {
        settings.isActive = isActive;
      }
      settings.updatedBy = req.admin._id;
      await settings.save();
    }

    logger.info(`Cashback settings updated by admin ${req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Cashback settings updated successfully',
      data: settings,
    });
  } catch (error) {
    logger.error('Update cashback settings error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update cashback settings',
    });
  }
};

/**
 * Get all cashback transactions (Admin only)
 */
exports.getAllCashbackTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const userId = req.query.userId;

    const query = {};
    if (userId) {
      query.user = userId;
    }

    const transactions = await CashbackTransaction.find(query)
      .populate('user', 'userName contactNumber email')
      .populate('orderId', 'orderNumber')
      .populate('adjustedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CashbackTransaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get all cashback transactions error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get cashback transactions',
    });
  }
};

/**
 * Adjust user cashback (Admin only)
 * Creates pending cashback that user needs to claim via API
 */
exports.adjustUserCashback = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { userId } = req.params;
    const { amount, description, expiresInDays } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const adjustmentAmount = parseFloat(amount);
    
    if (adjustmentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Adjustment amount must be greater than zero',
      });
    }

    // Calculate expiry date (optional, default 30 days)
    let expiresAt = null;
    if (expiresInDays) {
      const days = parseInt(expiresInDays);
      if (days > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
      }
    } else {
      // Default 30 days expiry
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    // Create pending cashback record
    const pendingCashback = await PendingCashback.create({
      user: userId,
      amount: adjustmentAmount,
      description: description || `Cashback adjusted by admin: +₹${adjustmentAmount}`,
      adjustedBy: req.admin._id,
      status: 'pending',
      expiresAt: expiresAt,
    });

    logger.info(`Pending cashback created for user ${userId} by admin ${req.admin._id}: +₹${adjustmentAmount}`);

    res.status(200).json({
      success: true,
      message: 'Cashback adjustment created. User needs to claim it via API.',
      data: {
        pendingCashbackId: pendingCashback._id,
        userId,
        amount: adjustmentAmount,
        status: 'pending',
        expiresAt: expiresAt,
        adjustedBy: req.admin._id,
      },
    });
  } catch (error) {
    logger.error('Adjust user cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to adjust cashback',
    });
  }
};

/**
 * Get user cashback statistics (Admin only)
 */
exports.getUserCashbackStats = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const totalEarned = await CashbackTransaction.aggregate([
      { $match: { user: user._id, type: 'earned' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalUsed = await CashbackTransaction.aggregate([
      { $match: { user: user._id, type: 'used' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalTransactions = await CashbackTransaction.countDocuments({ user: user._id });

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        currentCashback: user.cashback || 0,
        totalEarned: totalEarned[0]?.total || 0,
        totalUsed: totalUsed[0]?.total || 0,
        totalTransactions,
      },
    });
  } catch (error) {
    logger.error('Get user cashback stats error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get cashback statistics',
    });
  }
};

/**
 * ============================================
 * USER ENDPOINTS
 * ============================================
 */

/**
 * Get user cashback balance
 */
exports.getUserCashback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('cashback');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const settings = await CashbackSettings.getSettings();

    res.status(200).json({
      success: true,
      data: {
        cashback: user.cashback || 0,
        settings: {
          minimumCashbackToUse: settings.minimumCashbackToUse,
          maxCashbackUsagePercentage: settings.maxCashbackUsagePercentage,
          maxCashbackUsageAmount: settings.maxCashbackUsageAmount,
          isActive: settings.isActive,
        },
      },
    });
  } catch (error) {
    logger.error('Get user cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get cashback',
    });
  }
};

/**
 * Get user cashback transactions
 */
exports.getUserCashbackTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type; // Optional filter by type

    const query = { user: userId };
    if (type && ['earned', 'used', 'expired', 'adjusted'].includes(type)) {
      query.type = type;
    }

    const transactions = await CashbackTransaction.find(query)
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CashbackTransaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get user cashback transactions error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get cashback transactions',
    });
  }
};

/**
 * Get pending cashback for user
 */
exports.getPendingCashback = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const pendingCashbacks = await PendingCashback.find({
      user: userId,
      status: 'pending',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    })
      .populate('adjustedBy', 'name email')
      .sort({ createdAt: -1 });

    const totalPending = pendingCashbacks.reduce((sum, item) => sum + item.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        pendingCashbacks,
        totalPending: parseFloat(totalPending.toFixed(2)),
        count: pendingCashbacks.length,
      },
    });
  } catch (error) {
    logger.error('Get pending cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get pending cashback',
    });
  }
};

/**
 * Claim pending cashback (User only)
 */
exports.claimPendingCashback = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const { pendingCashbackId } = req.body;

    // Find pending cashback
    const pendingCashback = await PendingCashback.findOne({
      _id: pendingCashbackId,
      user: userId,
      status: 'pending',
    });

    if (!pendingCashback) {
      return res.status(404).json({
        success: false,
        error: 'Pending cashback not found or already claimed',
      });
    }

    // Check if expired
    if (pendingCashback.expiresAt && pendingCashback.expiresAt < new Date()) {
      pendingCashback.status = 'expired';
      await pendingCashback.save();
      return res.status(400).json({
        success: false,
        error: 'This cashback has expired',
      });
    }

    // Add cashback to user account
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const previousCashback = user.cashback || 0;
    const newCashback = previousCashback + pendingCashback.amount;
    user.cashback = newCashback;
    await user.save();

    // Update pending cashback status
    pendingCashback.status = 'claimed';
    pendingCashback.claimedAt = new Date();
    await pendingCashback.save();

    // Create transaction record
    await CashbackTransaction.create({
      user: userId,
      type: 'adjusted',
      amount: pendingCashback.amount,
      description: pendingCashback.description || `Cashback claimed: +₹${pendingCashback.amount}`,
      balanceAfter: newCashback,
      adjustedBy: pendingCashback.adjustedBy,
    });

    logger.info(`Cashback claimed by user ${userId}: +₹${pendingCashback.amount}`);

    res.status(200).json({
      success: true,
      message: 'Cashback claimed successfully',
      data: {
        previousCashback,
        claimedAmount: pendingCashback.amount,
        newCashback,
      },
    });
  } catch (error) {
    logger.error('Claim pending cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to claim cashback',
    });
  }
};

/**
 * Claim all pending cashback (User only)
 */
exports.claimAllPendingCashback = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find all pending cashbacks
    const pendingCashbacks = await PendingCashback.find({
      user: userId,
      status: 'pending',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (pendingCashbacks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending cashback to claim',
        data: {
          claimedAmount: 0,
          newCashback: 0,
          count: 0,
        },
      });
    }

    // Calculate total amount
    const totalAmount = pendingCashbacks.reduce((sum, item) => sum + item.amount, 0);

    // Add cashback to user account
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const previousCashback = user.cashback || 0;
    const newCashback = previousCashback + totalAmount;
    user.cashback = newCashback;
    await user.save();

    // Update all pending cashbacks
    const now = new Date();
    for (const pending of pendingCashbacks) {
      pending.status = 'claimed';
      pending.claimedAt = now;
      await pending.save();

      // Create transaction record for each
      await CashbackTransaction.create({
        user: userId,
        type: 'adjusted',
        amount: pending.amount,
        description: pending.description || `Cashback claimed: +₹${pending.amount}`,
        balanceAfter: newCashback,
        adjustedBy: pending.adjustedBy,
      });
    }

    logger.info(`All pending cashback claimed by user ${userId}: +₹${totalAmount} (${pendingCashbacks.length} items)`);

    res.status(200).json({
      success: true,
      message: `Successfully claimed ${pendingCashbacks.length} pending cashback(s)`,
      data: {
        previousCashback,
        claimedAmount: totalAmount,
        newCashback,
        count: pendingCashbacks.length,
      },
    });
  } catch (error) {
    logger.error('Claim all pending cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to claim cashback',
    });
  }
};

/**
 * Calculate available cashback for an order
 * This helps users see how much cashback they can use
 */
exports.calculateAvailableCashback = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderTotal } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId).select('cashback');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const settings = await CashbackSettings.getSettings();

    if (!settings.isActive) {
      return res.status(200).json({
        success: true,
        data: {
          availableCashback: 0,
          message: 'Cashback system is currently inactive',
        },
      });
    }

    const userCashback = user.cashback || 0;

    // Check minimum cashback to use
    if (userCashback < settings.minimumCashbackToUse) {
      return res.status(200).json({
        success: true,
        data: {
          availableCashback: 0,
          message: `Minimum ₹${settings.minimumCashbackToUse} cashback required to use`,
          userCashback,
        },
      });
    }

    // Calculate maximum cashback that can be used
    let maxUsable = userCashback;

    // Apply percentage limit
    if (settings.maxCashbackUsagePercentage > 0) {
      const maxByPercentage = (orderTotal * settings.maxCashbackUsagePercentage) / 100;
      maxUsable = Math.min(maxUsable, maxByPercentage);
    }

    // Apply absolute amount limit
    if (settings.maxCashbackUsageAmount > 0) {
      maxUsable = Math.min(maxUsable, settings.maxCashbackUsageAmount);
    }

    // Don't exceed order total
    maxUsable = Math.min(maxUsable, orderTotal);

    res.status(200).json({
      success: true,
      data: {
        availableCashback: Math.round(maxUsable * 100) / 100, // Round to 2 decimal places
        userCashback,
        settings: {
          minimumCashbackToUse: settings.minimumCashbackToUse,
          maxCashbackUsagePercentage: settings.maxCashbackUsagePercentage,
          maxCashbackUsageAmount: settings.maxCashbackUsageAmount,
        },
      },
    });
  } catch (error) {
    logger.error('Calculate available cashback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate available cashback',
    });
  }
};
