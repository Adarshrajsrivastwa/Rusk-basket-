const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Recipient is required'],
    refPath: 'recipientModel',
    index: true,
  },
  recipientModel: {
    type: String,
    required: [true, 'Recipient model is required'],
    enum: ['User', 'Vendor', 'Admin', 'Rider'],
  },
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: [
      'order_created',
      'order_updated',
      'order_cancelled',
      'order_delivered',
      'product_approved',
      'product_rejected',
      'invoice_generated',
      'payment_received',
      'ticket_created',
      'ticket_status_updated',
      'ticket_message_received',
      'general',
    ],
    default: 'general',
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters'],
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
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

// Index for faster queries
NotificationSchema.index({ recipient: 1, recipientModel: 1, isRead: 1 });
NotificationSchema.index({ recipient: 1, recipientModel: 1, createdAt: -1 });
NotificationSchema.index({ order: 1 });
NotificationSchema.index({ type: 1 });

// Update the updatedAt field before saving
NotificationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Notification', NotificationSchema);
