const mongoose = require('mongoose');

const ReferralSettingsSchema = new mongoose.Schema({
  // User referral settings
  userReferrerAmount: {
    type: Number,
    default: 0,
    min: [0, 'User referrer amount cannot be negative'],
    required: true,
  },
  userRefereeAmount: {
    type: Number,
    default: 0,
    min: [0, 'User referee amount cannot be negative'],
    required: true,
  },
  // Rider referral settings
  riderReferrerAmount: {
    type: Number,
    default: 0,
    min: [0, 'Rider referrer amount cannot be negative'],
    required: true,
  },
  riderRefereeAmount: {
    type: Number,
    default: 0,
    min: [0, 'Rider referee amount cannot be negative'],
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
ReferralSettingsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure only one settings document exists
ReferralSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      userReferrerAmount: 0,
      userRefereeAmount: 0,
      riderReferrerAmount: 0,
      riderRefereeAmount: 0,
      isActive: true,
    });
  }
  return settings;
};

module.exports = mongoose.model('ReferralSettings', ReferralSettingsSchema);
