const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  couponName: {
    type: String,
    required: [true, 'Coupon name is required'],
    trim: true,
    maxlength: [200, 'Coupon name cannot be more than 200 characters'],
  },
  offerId: {
    type: String,
    required: [true, 'Offer ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  offerType: {
    type: String,
    required: [true, 'Offer type is required'],
    enum: ['percentage', 'fixed', 'free_shipping', 'buy_one_get_one', 'prepaid', 'today_offer'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    trim: true,
    uppercase: true,
    match: [/^[A-Z0-9]+$/, 'Coupon code must contain only uppercase letters and numbers'],
  },
  minAmount: {
    type: Number,
    required: [true, 'Minimum amount is required'],
    min: [0, 'Minimum amount must be greater than or equal to 0'],
  },
  maxAmount: {
    type: Number,
    min: [0, 'Maximum amount must be greater than or equal to 0'],
  },
  discountAmount: {
    type: Number,
    min: [0, 'Discount amount must be greater than or equal to 0'],
  },
  discountPercentage: {
    type: Number,
    min: [0, 'Discount percentage must be between 0 and 100'],
    max: [100, 'Discount percentage must be between 0 and 100'],
  },
  // Applied On - All categories or Select categories
  appliedOn: {
    type: String,
    enum: ['all', 'select'],
    default: 'all',
  },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  }],
  // Prepaid Offer fields
  prepaidMinAmount: {
    type: Number,
    min: [0, 'Prepaid minimum amount must be greater than or equal to 0'],
  },
  prepaidMaxAmount: {
    type: Number,
    min: [0, 'Prepaid maximum amount must be greater than or equal to 0'],
  },
  prepaidDiscountPercentage: {
    type: Number,
    min: [0, 'Prepaid discount percentage must be between 0 and 100'],
    max: [100, 'Prepaid discount percentage must be between 0 and 100'],
  },
  // Offer for Today fields
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  }],
  offerAmount: {
    type: Number,
    min: [0, 'Offer amount must be greater than or equal to 0'],
  },
  dateRange: {
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
  },
  timeRange: {
    startTime: {
      type: String,
      match: [/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format (24-hour)'],
    },
    endTime: {
      type: String,
      match: [/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format (24-hour)'],
    },
  },
  sendNotification: {
    type: Boolean,
    default: true,
  },
  notificationSent: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active',
  },
  validFrom: {
    type: Date,
    default: Date.now,
  },
  validUntil: {
    type: Date,
  },
  usageLimit: {
    type: Number,
    min: [0, 'Usage limit must be greater than or equal to 0'],
  },
  usedCount: {
    type: Number,
    default: 0,
    min: [0, 'Used count cannot be negative'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'createdByModel',
  },
  createdByModel: {
    type: String,
    enum: ['Admin', 'Vendor'],
    required: true,
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
CouponSchema.index({ code: 1 });
CouponSchema.index({ offerId: 1 });
CouponSchema.index({ status: 1, isActive: 1 });
CouponSchema.index({ validFrom: 1, validUntil: 1 });

// Method to check if coupon is valid
CouponSchema.methods.isValid = function () {
  const now = new Date();
  if (this.status !== 'active' || !this.isActive) {
    return false;
  }
  if (this.validFrom && now < this.validFrom) {
    return false;
  }
  if (this.validUntil && now > this.validUntil) {
    return false;
  }
  if (this.usageLimit && this.usedCount >= this.usageLimit) {
    return false;
  }
  return true;
};

// Method to check if coupon is valid for today's offer
CouponSchema.methods.isTodayOfferActive = function () {
  if (this.offerType !== 'today_offer') {
    return false;
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check date range
  if (this.dateRange && this.dateRange.startDate && this.dateRange.endDate) {
    const startDate = new Date(this.dateRange.startDate);
    const endDate = new Date(this.dateRange.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    if (currentDate < startDate || currentDate > endDate) {
      return false;
    }
  }

  // Check time range
  if (this.timeRange && this.timeRange.startTime && this.timeRange.endTime) {
    if (currentTime < this.timeRange.startTime || currentTime > this.timeRange.endTime) {
      return false;
    }
  }

  return this.isValid();
};

// Method to calculate discount
CouponSchema.methods.calculateDiscount = function (orderAmount, productId = null) {
  if (!this.isValid()) {
    return { valid: false, discount: 0, message: 'Coupon is not valid' };
  }

  // Check if today's offer is active
  if (this.offerType === 'today_offer' && !this.isTodayOfferActive()) {
    return {
      valid: false,
      discount: 0,
      message: 'Today\'s offer is not active at this time',
    };
  }

  // Check if product is in the offer list for today_offer
  if (this.offerType === 'today_offer' && this.products && this.products.length > 0) {
    if (!productId || !this.products.includes(productId)) {
      return {
        valid: false,
        discount: 0,
        message: 'This offer is not applicable for the selected product',
      };
    }
  }

  if (orderAmount < this.minAmount) {
    return {
      valid: false,
      discount: 0,
      message: `Minimum order amount of ₹${this.minAmount} is required`,
    };
  }

  if (this.maxAmount && orderAmount > this.maxAmount) {
    return {
      valid: false,
      discount: 0,
      message: `Maximum order amount of ₹${this.maxAmount} is allowed`,
    };
  }

  let discount = 0;

  switch (this.offerType) {
    case 'percentage':
      if (this.discountPercentage) {
        discount = (orderAmount * this.discountPercentage) / 100;
      }
      break;
    case 'fixed':
      if (this.discountAmount) {
        discount = Math.min(this.discountAmount, orderAmount);
      }
      break;
    case 'prepaid':
      if (this.prepaidDiscountPercentage) {
        discount = (orderAmount * this.prepaidDiscountPercentage) / 100;
        // Apply prepaid min/max constraints
        if (this.prepaidMinAmount && discount < this.prepaidMinAmount) {
          discount = this.prepaidMinAmount;
        }
        if (this.prepaidMaxAmount && discount > this.prepaidMaxAmount) {
          discount = this.prepaidMaxAmount;
        }
      }
      break;
    case 'today_offer':
      if (this.offerAmount) {
        discount = Math.min(this.offerAmount, orderAmount);
      }
      break;
    case 'free_shipping':
      discount = 0; // Free shipping is handled separately
      break;
    case 'buy_one_get_one':
      discount = 0; // BOGO is handled separately
      break;
  }

  return {
    valid: true,
    discount: parseFloat(discount.toFixed(2)),
    message: 'Coupon applied successfully',
  };
};

module.exports = mongoose.model('Coupon', CouponSchema);

