const mongoose = require('mongoose');

const CashbackSettingsSchema = new mongoose.Schema({
  // Cashback percentage (e.g., 5 means 5% cashback)
  cashbackPercentage: {
    type: Number,
    default: 0,
    min: [0, 'Cashback percentage cannot be negative'],
    max: [100, 'Cashback percentage cannot exceed 100%'],
    required: true,
  },
  // Minimum order amount to earn cashback
  minimumOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order amount cannot be negative'],
    required: true,
  },
  // Maximum cashback amount per order (optional, 0 means no limit)
  maximumCashbackPerOrder: {
    type: Number,
    default: 0,
    min: [0, 'Maximum cashback cannot be negative'],
    required: true,
  },
  // Minimum cashback amount to use (e.g., user needs at least ₹50 to use)
  minimumCashbackToUse: {
    type: Number,
    default: 0,
    min: [0, 'Minimum cashback to use cannot be negative'],
    required: true,
  },
  // Maximum cashback that can be used per order (as percentage of order total)
  maxCashbackUsagePercentage: {
    type: Number,
    default: 0,
    min: [0, 'Max cashback usage percentage cannot be negative'],
    max: [100, 'Max cashback usage percentage cannot exceed 100%'],
    required: true,
  },
  // Maximum cashback that can be used per order (absolute amount, 0 means no limit)
  maxCashbackUsageAmount: {
    type: Number,
    default: 0,
    min: [0, 'Max cashback usage amount cannot be negative'],
    required: true,
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  // Updated by admin
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update updatedAt before saving
CashbackSettingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure only one settings document exists
CashbackSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      cashbackPercentage: 5,
      minimumOrderAmount: 100,
      maximumCashbackPerOrder: 0,
      minimumCashbackToUse: 50,
      maxCashbackUsagePercentage: 20,
      maxCashbackUsageAmount: 0,
      isActive: true,
    });
  }
  return settings;
};

module.exports = mongoose.model('CashbackSettings', CashbackSettingsSchema);
