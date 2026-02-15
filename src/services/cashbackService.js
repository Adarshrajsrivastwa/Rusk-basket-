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

  // Validate requested amount
  let finalCashbackAmount = parseFloat(cashbackAmount);
  
  if (finalCashbackAmount <= 0) {
    throw new Error('Cashback amount must be greater than 0');
  }

  if (finalCashbackAmount > userCashback) {
    throw new Error(`Insufficient cashback balance. You have ₹${userCashback} available`);
  }

  if (finalCashbackAmount > maxUsable) {
    throw new Error(`Maximum ₹${maxUsable} cashback can be used for this order`);
  }

  // Don't exceed order total
  if (finalCashbackAmount > orderTotal) {
    finalCashbackAmount = orderTotal;
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
