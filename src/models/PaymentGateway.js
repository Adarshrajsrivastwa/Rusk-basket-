const mongoose = require('mongoose');

const PaymentGatewaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Payment gateway name is required'],
    enum: ['shopify', 'razorpay', 'phonepay'],
    unique: true,
    trim: true,
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
  },
  isEnabled: {
    type: Boolean,
    default: false,
  },
  credentials: {
    // Shopify credentials
    shopifyStoreUrl: {
      type: String,
      trim: true,
    },
    shopifyApiKey: {
      type: String,
      trim: true,
    },
    shopifyApiSecret: {
      type: String,
      trim: true,
    },
    shopifyAccessToken: {
      type: String,
      trim: true,
    },
    
    // Razorpay credentials
    razorpayKeyId: {
      type: String,
      trim: true,
    },
    razorpayKeySecret: {
      type: String,
      trim: true,
    },
    
    // PhonePe credentials
    phonepayMerchantId: {
      type: String,
      trim: true,
    },
    phonepaySaltKey: {
      type: String,
      trim: true,
    },
    phonepaySaltIndex: {
      type: String,
      trim: true,
    },
    phonepayAppId: {
      type: String,
      trim: true,
    },
  },
  testMode: {
    type: Boolean,
    default: false,
  },
  testCredentials: {
    // Test credentials for development
    shopifyStoreUrl: {
      type: String,
      trim: true,
    },
    shopifyApiKey: {
      type: String,
      trim: true,
    },
    shopifyApiSecret: {
      type: String,
      trim: true,
    },
    shopifyAccessToken: {
      type: String,
      trim: true,
    },
    razorpayKeyId: {
      type: String,
      trim: true,
    },
    razorpayKeySecret: {
      type: String,
      trim: true,
    },
    phonepayMerchantId: {
      type: String,
      trim: true,
    },
    phonepaySaltKey: {
      type: String,
      trim: true,
    },
    phonepaySaltIndex: {
      type: String,
      trim: true,
    },
    phonepayAppId: {
      type: String,
      trim: true,
    },
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters'],
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

PaymentGatewaySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
PaymentGatewaySchema.index({ name: 1 });
PaymentGatewaySchema.index({ isEnabled: 1 });

module.exports = mongoose.model('PaymentGateway', PaymentGatewaySchema);
