const mongoose = require('mongoose');

const PaymentRequestSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Requested by is required'],
    index: true,
  },
  requestedByType: {
    type: String,
    required: [true, 'Requested by type is required'],
    enum: ['User', 'Vendor', 'Rider', 'Admin'],
    index: true,
  },
  requestedTo: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Requested to is required'],
    index: true,
  },
  requestedToType: {
    type: String,
    required: [true, 'Requested to type is required'],
    enum: ['User', 'Vendor', 'Rider', 'Admin', 'System'],
    index: true,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters'],
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'bank_transfer', 'upi', 'cash', 'other'],
    default: 'wallet',
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'approvedByType',
  },
  approvedByType: {
    type: String,
    enum: ['Admin', 'Vendor', 'User', 'Rider'],
  },
  approvedAt: {
    type: Date,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'rejectedByType',
  },
  rejectedByType: {
    type: String,
    enum: ['Admin', 'Vendor', 'User', 'Rider'],
  },
  rejectedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot be more than 500 characters'],
  },
  cancelledAt: {
    type: Date,
  },
  transactionId: {
    type: String,
    trim: true,
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
PaymentRequestSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for better query performance
PaymentRequestSchema.index({ requestedBy: 1, requestedByType: 1, status: 1 });
PaymentRequestSchema.index({ requestedTo: 1, requestedToType: 1, status: 1 });
PaymentRequestSchema.index({ status: 1, requestedAt: -1 });
PaymentRequestSchema.index({ createdAt: -1 });
PaymentRequestSchema.index({ orderId: 1 });

module.exports = mongoose.model('PaymentRequest', PaymentRequestSchema);
