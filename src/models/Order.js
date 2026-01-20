const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
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
    thumbnail: {
      url: {
        type: String,
      },
      publicId: {
        type: String,
      },
    },
    image: {
      url: {
        type: String,
      },
      publicId: {
        type: String,
      },
      mediaType: {
        type: String,
        enum: ['image', 'video'],
      },
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
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price must be greater than or equal to 0'],
    },
    cashback: {
      type: Number,
      default: 0,
      min: [0, 'Cashback must be greater than or equal to 0'],
    },
    sku: {
      type: String,
      trim: true,
    },
  }],
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal must be greater than or equal to 0'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount must be greater than or equal to 0'],
    },
    shipping: {
      type: Number,
      default: 0,
      min: [0, 'Shipping must be greater than or equal to 0'],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, 'Tax must be greater than or equal to 0'],
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total must be greater than or equal to 0'],
    },
    totalCashback: {
      type: Number,
      default: 0,
      min: [0, 'Total cashback must be greater than or equal to 0'],
    },
  },
  coupon: {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
  },
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
  payment: {
    method: {
      type: String,
      enum: ['cod', 'prepaid', 'wallet', 'upi', 'card'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    transactionId: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Payment amount must be greater than or equal to 0'],
    },
  },
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'processing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded',
    ],
    default: 'pending',
    index: true,
  },
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
  },
  assignedAt: {
    type: Date,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  assignmentNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Assignment notes cannot be more than 1000 characters'],
  },
  assignmentRequestSentAt: {
    type: Date,
  },
  assignmentRequestSentTo: [{
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending',
    },
    respondedAt: {
      type: Date,
    },
  }],
  estimatedDelivery: {
    type: Date,
  },
  deliveredAt: {
    type: Date,
  },
  cancelledAt: {
    type: Date,
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancellation reason cannot be more than 500 characters'],
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'vendor', 'admin', 'system'],
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot be more than 1000 characters'],
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

OrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Generate unique order number
OrderSchema.statics.generateOrderNumber = async function () {
  let orderNumber;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    const timestamp = Date.now().toString().slice(-8);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    orderNumber = `RB${timestamp}${randomNum}`;
    const order = await this.findOne({ orderNumber });
    if (!order) {
      exists = false;
    }
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique order number after multiple attempts');
  }

  return orderNumber;
};

// Indexes for better query performance
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ 'items.vendor': 1, status: 1 });
OrderSchema.index({ rider: 1, status: 1 });
OrderSchema.index({ orderNumber: 1 });

module.exports = mongoose.model('Order', OrderSchema);




