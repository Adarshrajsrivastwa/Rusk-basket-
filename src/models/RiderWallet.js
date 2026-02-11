const mongoose = require('mongoose');

const RiderWalletSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    required: [true, 'Rider is required'],
    unique: true,
    index: true,
  },
  dueBalance: {
    type: Number,
    default: 0,
    min: [0, 'Due balance cannot be negative'],
  },
  pendingBalance: {
    type: Number,
    default: 0,
    min: [0, 'Pending balance cannot be negative'],
  },
  transactions: [{
    type: {
      type: String,
      enum: ['credit', 'debit', 'reset'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be greater than or equal to 0'],
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    orderNumber: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'transactions.performedByModel',
    },
    performedByModel: {
      type: String,
      enum: ['Admin', 'Vendor'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
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
RiderWalletSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
RiderWalletSchema.index({ rider: 1 });
RiderWalletSchema.index({ 'transactions.orderId': 1 });

module.exports = mongoose.model('RiderWallet', RiderWalletSchema);
