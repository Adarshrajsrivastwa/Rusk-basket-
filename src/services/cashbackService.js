const Cart = require('../models/Cart');
const User = require('../models/User');
const CashbackSettings = require('../models/CashbackSettings');
const { calculateMaxUsableCashback } = require('../utils/cashbackHelper');
const logger = require('../utils/logger');

/**
 * Apply cashback to cart
 */
exports.applyCashbackToCart = async (userId, cashbackAmount) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  if (cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  // Get user's current cashback balance
  const user = await User.findById(userId).select('cashback');
  if (!user) {
    throw new Error('User not found');
  }

  const userCashback = user.cashback || 0;

  if (userCashback <= 0) {
    throw new Error('You have no cashback balance');
  }

  // Calculate cart totals to get order total
  const totals = await cart.calculateTotals();
  const orderTotal = totals.pricing.total;

  // Get cashback settings
  const settings = await CashbackSettings.getSettings();

  if (!settings.isActive) {
    throw new Error('Cashback system is currently inactive');
  }

  // Check minimum cashback to use
  if (userCashback < settings.minimumCashbackToUse) {
    throw new Error(`Minimum ₹${settings.minimumCashbackToUse} cashback required to use`);
  }

  // Calculate maximum usable cashback
  const maxUsableResult = await calculateMaxUsableCashback(userId, orderTotal);
  if (!maxUsableResult.success) {
    throw new Error(maxUsableResult.error || 'Failed to calculate usable cashback');
  }

  const maxUsable = maxUsableResult.availableCashback;

  // If cashbackAmount not provided, automatically use maximum possible amount
  let finalCashbackAmount;
  let wasAdjusted = false;
  let adjustmentReason = null;
  let originalRequestedAmount = null;
  
  if (!cashbackAmount || cashbackAmount === null || cashbackAmount === undefined || cashbackAmount === '') {
    // Auto-apply maximum possible cashback
    finalCashbackAmount = maxUsable;
    wasAdjusted = true;
    adjustmentReason = `Auto-applied maximum possible cashback: ₹${maxUsable}`;
    originalRequestedAmount = null; // No specific amount was requested
    logger.info(`Auto-applying maximum cashback: ₹${maxUsable} for user ${userId}`);
  } else {
    // Validate and auto-adjust requested amount
    finalCashbackAmount = parseFloat(cashbackAmount);
    originalRequestedAmount = finalCashbackAmount;
    
    if (finalCashbackAmount <= 0 || isNaN(finalCashbackAmount)) {
      throw new Error('Cashback amount must be greater than 0');
    }
  }

  // Auto-adjust: Don't exceed user's cashback balance
  if (finalCashbackAmount > userCashback) {
    finalCashbackAmount = userCashback;
    wasAdjusted = true;
    adjustmentReason = `Adjusted to available balance: ₹${userCashback}`;
    const logAmount = originalRequestedAmount !== null ? `₹${originalRequestedAmount}` : 'auto-requested';
    logger.info(`Cashback amount adjusted from ${logAmount} to ₹${finalCashbackAmount} (user balance limit)`);
  }

  // Auto-adjust: Don't exceed maximum usable cashback
  if (finalCashbackAmount > maxUsable) {
    finalCashbackAmount = maxUsable;
    wasAdjusted = true;
    adjustmentReason = `Adjusted to maximum usable: ₹${maxUsable}`;
    const logAmount = originalRequestedAmount !== null ? `₹${originalRequestedAmount}` : 'auto-requested';
    logger.info(`Cashback amount adjusted from ${logAmount} to ₹${finalCashbackAmount} (max usable limit)`);
  }

  // Auto-adjust: Don't exceed order total
  if (finalCashbackAmount > orderTotal) {
    finalCashbackAmount = orderTotal;
    wasAdjusted = true;
    adjustmentReason = `Adjusted to order total: ₹${orderTotal}`;
    const logAmount = originalRequestedAmount !== null ? `₹${originalRequestedAmount}` : 'auto-requested';
    logger.info(`Cashback amount adjusted from ${logAmount} to ₹${finalCashbackAmount} (order total limit)`);
  }

  // Apply cashback to cart
  cart.cashbackUsage = Math.round(finalCashbackAmount * 100) / 100;
  await cart.save();

  // Recalculate totals with cashback
  const updatedTotals = await cart.calculateTotals();

  return {
    cart,
    totals: updatedTotals,
    cashbackApplied: cart.cashbackUsage,
    requestedAmount: originalRequestedAmount, // null if auto-applied
    wasAutoApplied: originalRequestedAmount === null, // true if no amount was sent
    wasAdjusted: wasAdjusted,
    adjustmentReason: adjustmentReason,
    maxUsableCashback: maxUsable,
    userCashbackBalance: userCashback,
  };
};

/**
 * Remove cashback from cart
 */
exports.removeCashbackFromCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new Error('Cart not found for this user');
  }

  cart.cashbackUsage = 0;
  await cart.save();

  // Recalculate totals
  const totals = await cart.calculateTotals();

  return {
    cart,
    totals,
  };
};

module.exports = exports;
