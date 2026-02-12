const mongoose = require('mongoose');

const RiderDueAmountRequestSchema = new mongoose.Schema({
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    required: [true, 'Rider is required'],
    index: true,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters'],
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  currentDueBalance: {
    type: Number,
    required: true,
    min: [0, 'Current due balance cannot be negative'],
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  approvedAt: {
    type: Date,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  rejectedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot be more than 500 characters'],
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
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
RiderDueAmountRequestSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for better query performance
RiderDueAmountRequestSchema.index({ rider: 1, status: 1 });
RiderDueAmountRequestSchema.index({ status: 1, requestedAt: -1 });
RiderDueAmountRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RiderDueAmountRequest', RiderDueAmountRequestSchema);
