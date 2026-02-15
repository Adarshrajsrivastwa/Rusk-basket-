const mongoose = require('mongoose');

const PendingCashbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be greater than or equal to 0'],
  },
  description: {
    type: String,
    trim: true,
  },
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'expired'],
    default: 'pending',
    index: true,
  },
  claimedAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for faster queries
PendingCashbackSchema.index({ user: 1, status: 1 });
PendingCashbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PendingCashback', PendingCashbackSchema);
