const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Created by is required'],
    refPath: 'createdByModel',
  },
  createdByModel: {
    type: String,
    required: [true, 'Created by model is required'],
    enum: ['User', 'Vendor'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'order_delivery',
      'account_profile',
      'payments_refunds',
      'login_otp',
      'general_queries'
    ],
    default: 'general_queries',
  },
  complaint: {
    type: String,
    required: [true, 'Complaint is required'],
    trim: true,
    maxlength: [2000, 'Complaint cannot be more than 2000 characters'],
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'resolved', 'closed'],
    default: 'active',
    index: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  adminResponse: {
    type: String,
    trim: true,
    maxlength: [2000, 'Admin response cannot be more than 2000 characters'],
  },
  resolvedAt: {
    type: Date,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  statusChangedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'messages.senderModel',
    },
    senderModel: {
      type: String,
      required: true,
      enum: ['User', 'Vendor', 'Admin'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [2000, 'Message cannot be more than 2000 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient queries
TicketSchema.index({ user: 1, createdAt: -1 });
TicketSchema.index({ status: 1, createdAt: -1 });

// Update updatedAt before saving
TicketSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to mark ticket as resolved
TicketSchema.methods.markAsResolved = function (adminId, response) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolvedBy = adminId;
  if (response) {
    this.adminResponse = response;
  }
};

// Static method to generate unique ticket number
TicketSchema.statics.generateTicketNumber = async function () {
  let ticketNumber;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (exists && attempts < maxAttempts) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    ticketNumber = `TKT${randomNum}`;
    const ticket = await this.findOne({ ticketNumber });
    if (!ticket) {
      exists = false;
    }
    attempts++;
  }
  
  if (exists) {
    throw new Error('Failed to generate unique ticket number after multiple attempts');
  }
  
  return ticketNumber;
};

// Create unique sparse index for ticketNumber (only for non-null values)
TicketSchema.index(
  { ticketNumber: 1 },
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { ticketNumber: { $exists: true, $ne: null } }
  }
);

module.exports = mongoose.model('Ticket', TicketSchema);
