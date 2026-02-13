const mongoose = require('mongoose');

const DailyOrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price must be greater than or equal to 0'],
    },
    salePrice: {
      type: Number,
      required: true,
      min: [0, 'Sale price must be greater than or equal to 0'],
    },
    sku: {
      type: String,
      trim: true,
    },
  }],
  shippingAddress: {
    line1: {
      type: String,
      required: true,
      trim: true,
    },
    line2: {
      type: String,
      trim: true,
    },
    pinCode: {
      type: String,
      required: true,
      match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit PIN code'],
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number'],
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
  },
  deliveryTime: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  daysOfWeek: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot be more than 1000 characters'],
  },
  lastOrderDate: {
    type: Date,
  },
  nextOrderDate: {
    type: Date,
    index: true,
  },
  totalOrdersPlaced: {
    type: Number,
    default: 0,
  },
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

DailyOrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Calculate next order date if daysOfWeek is set
  if (this.daysOfWeek && this.daysOfWeek.length > 0 && this.isActive) {
    this.nextOrderDate = this.calculateNextOrderDate();
  }
  
  next();
});

// Method to calculate next order date based on days of week
DailyOrderSchema.methods.calculateNextOrderDate = function () {
  if (!this.daysOfWeek || this.daysOfWeek.length === 0) {
    return null;
  }

  const dayMap = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dayNumbers = this.daysOfWeek.map(day => dayMap[day.toLowerCase()]).sort((a, b) => a - b);
  
  // Find next day from today
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dayOfWeek = checkDate.getDay();
    
    if (dayNumbers.includes(dayOfWeek)) {
      return checkDate;
    }
  }
  
  // If no day found in next 7 days, return first day of next week
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + (7 - today.getDay() + dayNumbers[0]));
  return nextDate;
};

// Indexes for better query performance
DailyOrderSchema.index({ user: 1, isActive: 1 });
DailyOrderSchema.index({ nextOrderDate: 1, isActive: 1 });
DailyOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DailyOrder', DailyOrderSchema);
