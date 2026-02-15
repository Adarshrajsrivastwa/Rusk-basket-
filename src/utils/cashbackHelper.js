const CashbackSettings = require('../models/CashbackSettings');
const CashbackTransaction = require('../models/CashbackTransaction');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Calculate cashback based on order total and settings
 * @param {Number} orderTotal - Total order amount
 * @returns {Promise<Number>} - Calculated cashback amount
 */
exports.calculateCashbackFromOrder = async (orderTotal) => {
  try {
    const settings = await CashbackSettings.getSettings();

    if (!settings.isActive) {
      return 0;
    }

    // Check minimum order amount
    if (orderTotal < settings.minimumOrderAmount) {
      return 0;
    }

    // Calculate cashback percentage
    let cashback = (orderTotal * settings.cashbackPercentage) / 100;

    // Apply maximum cashback per order limit
    if (settings.maximumCashbackPerOrder > 0 && cashback > settings.maximumCashbackPerOrder) {
      cashback = settings.maximumCashbackPerOrder;
    }

    return Math.round(cashback * 100) / 100; // Round to 2 decimal places
  } catch (error) {
    logger.error('Error calculating cashback from order:', error);
    return 0;
  }
};

/**
 * Add cashback to user account and create transaction record
 * @param {String} userId - User ID
 * @param {Number} amount - Cashback amount to add
 * @param {String} orderId - Order ID (optional)
 * @param {String} orderNumber - Order number (optional)
 * @param {String} description - Transaction description (optional)
 * @returns {Promise<Object>} - Updated user cashback
 */
exports.addCashbackToUser = async (userId, amount, orderId = null, orderNumber = null, description = null) => {
  try {
    if (!amount || amount <= 0) {
      return { success: false, error: 'Invalid cashback amount' };
    }

    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const previousCashback = user.cashback || 0;
    const newCashback = previousCashback + amount;
    user.cashback = newCashback;
    await user.save();

    // Create transaction record
    await CashbackTransaction.create({
      user: userId,
      type: 'earned',
      amount: amount,
      orderId: orderId,
      orderNumber: orderNumber,
      description: description || `Cashback earned from order ${orderNumber || ''}`.trim(),
      balanceAfter: newCashback,
    });

    logger.info(`Cashback added to user ${userId}: Previous: ₹${previousCashback}, Added: ₹${amount}, New Total: ₹${newCashback}`);

    return {
      success: true,
      previousCashback,
      newCashback,
      amount,
    };
  } catch (error) {
    logger.error('Error adding cashback to user:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Use cashback from user account and create transaction record
 * @param {String} userId - User ID
 * @param {Number} amount - Cashback amount to use
 * @param {String} orderId - Order ID (optional)
 * @param {String} orderNumber - Order number (optional)
 * @param {String} description - Transaction description (optional)
 * @returns {Promise<Object>} - Updated user cashback
 */
exports.useCashbackFromUser = async (userId, amount, orderId = null, orderNumber = null, description = null) => {
  try {
    if (!amount || amount <= 0) {
      return { success: false, error: 'Invalid cashback amount' };
    }

    const user = await User.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const currentCashback = user.cashback || 0;
    
    if (currentCashback < amount) {
      return { success: false, error: 'Insufficient cashback balance' };
    }

    const newCashback = currentCashback - amount;
    user.cashback = newCashback;
    await user.save();

    // Create transaction record
    await CashbackTransaction.create({
      user: userId,
      type: 'used',
      amount: amount,
      orderId: orderId,
      orderNumber: orderNumber,
      description: description || `Cashback used for order ${orderNumber || ''}`.trim(),
      balanceAfter: newCashback,
    });

    logger.info(`Cashback used by user ${userId}: Previous: ₹${currentCashback}, Used: ₹${amount}, New Total: ₹${newCashback}`);

    return {
      success: true,
      previousCashback: currentCashback,
      newCashback,
      amount,
    };
  } catch (error) {
    logger.error('Error using cashback from user:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Calculate maximum cashback that can be used for an order
 * @param {String} userId - User ID
 * @param {Number} orderTotal - Order total amount
 * @returns {Promise<Object>} - Available cashback information
 */
exports.calculateMaxUsableCashback = async (userId, orderTotal) => {
  try {
    const user = await User.findById(userId).select('cashback');
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const settings = await CashbackSettings.getSettings();

    if (!settings.isActive) {
      return {
        success: true,
        availableCashback: 0,
        message: 'Cashback system is currently inactive',
      };
    }

    const userCashback = user.cashback || 0;

    // Check minimum cashback to use
    if (userCashback < settings.minimumCashbackToUse) {
      return {
        success: true,
        availableCashback: 0,
        message: `Minimum ₹${settings.minimumCashbackToUse} cashback required to use`,
        userCashback,
      };
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

    return {
      success: true,
      availableCashback: Math.round(maxUsable * 100) / 100,
      userCashback,
    };
  } catch (error) {
    logger.error('Error calculating max usable cashback:', error);
    return { success: false, error: error.message };
  }
};
