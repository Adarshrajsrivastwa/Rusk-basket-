const mongoose = require('mongoose');

const CashbackTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  type: {
    type: String,
    enum: ['earned', 'used', 'expired', 'adjusted', 'pending'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'expired'],
    default: 'claimed',
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be greater than or equal to 0'],
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true,
  },
  orderNumber: {
    type: String,
  },
  description: {
    type: String,
    trim: true,
  },
  // Balance after this transaction
  balanceAfter: {
    type: Number,
    required: true,
    min: [0, 'Balance cannot be negative'],
  },
  // For adjustments by admin
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for faster queries
CashbackTransactionSchema.index({ user: 1, createdAt: -1 });
CashbackTransactionSchema.index({ orderId: 1 });

module.exports = mongoose.model('CashbackTransaction', CashbackTransactionSchema);
