const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Get user wallet balance
 */
exports.getWallet = async (req, res, next) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ user: userId })
      .populate('transactions.orderId', 'orderNumber')
      .sort({ 'transactions.createdAt': -1 });

    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = await Wallet.create({ user: userId, balance: 0 });
    }

    res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    logger.error('Get wallet error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get wallet',
    });
  }
};

/**
 * Reset wallet balance (Vendor/Admin only)
 */
exports.resetWallet = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { userId } = req.params;
    const { reason } = req.body;

    // Check if user is vendor or admin
    if (!req.vendor && !req.admin) {
      return res.status(403).json({
        success: false,
        error: 'Only vendor or admin can reset wallet',
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId, balance: 0 });
    }

    const previousBalance = wallet.balance;

    // Reset wallet balance to 0
    wallet.balance = 0;

    // Add reset transaction
    wallet.transactions.push({
      type: 'reset',
      amount: previousBalance,
      description: reason || `Wallet reset by ${req.vendor ? 'Vendor' : 'Admin'}`,
      performedBy: req.vendor ? req.vendor._id : req.admin._id,
      performedByModel: req.vendor ? 'Vendor' : 'Admin',
    });

    await wallet.save();

    logger.info(`Wallet reset for user ${userId} by ${req.vendor ? 'Vendor' : 'Admin'} ${req.vendor ? req.vendor.storeId : req.admin.email}, previous balance: ${previousBalance}`);

    res.status(200).json({
      success: true,
      message: 'Wallet reset successfully',
      data: {
        userId: userId,
        previousBalance: previousBalance,
        newBalance: 0,
        resetBy: req.vendor ? 'Vendor' : 'Admin',
        resetAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Reset wallet error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to reset wallet',
    });
  }
};

/**
 * Get wallet transactions
 */
exports.getWalletTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId, balance: 0 });
    }

    // Get transactions with pagination
    const transactions = wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + limit);

    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        transactions: transactions,
        pagination: {
          page: page,
          limit: limit,
          total: totalTransactions,
          pages: totalPages,
        },
      },
    });
  } catch (error) {
    logger.error('Get wallet transactions error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get wallet transactions',
    });
  }
};
