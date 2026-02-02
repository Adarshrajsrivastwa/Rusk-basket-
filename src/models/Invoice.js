const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Order is required'],
    index: true,
  },
  orderNumber: {
    type: String,
    required: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Vendor is required'],
    index: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be greater than or equal to 0'],
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
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled', 'refunded'],
    default: 'pending',
    index: true,
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
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
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price must be greater than or equal to 0'],
    },
    sku: {
      type: String,
      trim: true,
    },
    hssn: {
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
    itemCost: {
      type: Number,
      required: true,
      min: [0, 'Item cost must be greater than or equal to 0'],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, 'Tax must be greater than or equal to 0'],
    },
    cgst: {
      type: Number,
      default: 0,
      min: [0, 'CGST must be greater than or equal to 0'],
    },
    sgst: {
      type: Number,
      default: 0,
      min: [0, 'SGST must be greater than or equal to 0'],
    },
    totalGst: {
      type: Number,
      default: 0,
      min: [0, 'Total GST must be greater than or equal to 0'],
    },
    handlingCharge: {
      type: Number,
      default: 0,
      min: [0, 'Handling charge must be greater than or equal to 0'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount must be greater than or equal to 0'],
    },
    totalCashback: {
      type: Number,
      default: 0,
      min: [0, 'Total cashback must be greater than or equal to 0'],
    },
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

InvoiceSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Generate unique invoice number in format: RUSH-INV-YYYY-XXX
InvoiceSchema.statics.generateInvoiceNumber = async function () {
  const year = new Date().getFullYear();
  let invoiceNumber;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;
  let sequence = 1;

  while (exists && attempts < maxAttempts) {
    // Format: RUSH-INV-YYYY-XXX (e.g., RUSH-INV-2025-001)
    invoiceNumber = `RUSH-INV-${year}-${sequence.toString().padStart(3, '0')}`;
    
    const invoice = await this.findOne({ invoiceNumber });
    if (!invoice) {
      exists = false;
    } else {
      sequence++;
    }
    attempts++;
  }

  if (exists) {
    // If we can't find a unique number, use timestamp as fallback
    const timestamp = Date.now().toString().slice(-6);
    invoiceNumber = `RUSH-INV-${year}-${timestamp}`;
  }

  return invoiceNumber;
};

// Indexes for better query performance
InvoiceSchema.index({ user: 1, createdAt: -1 });
InvoiceSchema.index({ vendor: 1, createdAt: -1 });
InvoiceSchema.index({ order: 1 });
InvoiceSchema.index({ status: 1, createdAt: -1 });
InvoiceSchema.index({ invoiceNumber: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
