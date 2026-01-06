const mongoose = require('mongoose');

const CartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    unique: true,
    index: true,
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    sku: {
      type: String,
      trim: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
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
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

CartSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Method to calculate cart totals (will be used in service)
CartSchema.methods.calculateTotals = async function () {
  const Product = mongoose.model('Product');
  const Coupon = mongoose.model('Coupon');

  let subtotal = 0;
  let totalCashback = 0;
  const itemsWithDetails = [];
  const unavailableItems = [];

  for (const item of this.items) {
    const product = await Product.findById(item.product)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .populate('vendor', 'storeName storeId isActive');

    if (!product) {
      unavailableItems.push({
        itemId: item._id,
        reason: 'Product not found',
      });
      continue;
    }

    // Check vendor status
    if (!product.vendor || !product.vendor.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: 'Vendor is inactive',
      });
      continue;
    }

    // Check product status
    if (!product.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: 'Product is inactive',
      });
      continue;
    }

    // Normalize approval status (trim and lowercase for comparison)
    const approvalStatus = product.approvalStatus ? String(product.approvalStatus).trim().toLowerCase() : null;

    if (!approvalStatus) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: 'Product approval status is missing',
      });
      continue;
    }

    if (approvalStatus !== 'approved') {
      const statusMessages = {
        'pending': 'Product is pending approval',
        'rejected': 'Product has been rejected',
      };
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: statusMessages[approvalStatus] || `Product status is ${product.approvalStatus}`,
      });
      continue;
    }

    // Check inventory
    const availableInventory = product.skus && product.skus.length > 0
      ? product.skus.find(s => s.sku === item.sku)?.inventory || 0
      : product.inventory;

    if (availableInventory < item.quantity) {
      unavailableItems.push({
        itemId: item._id,
        productName: product.productName,
        reason: `Only ${availableInventory} items available in stock`,
      });
      continue;
    }

    const unitPrice = product.salePrice || product.regularPrice || product.actualPrice;
    const itemTotal = unitPrice * item.quantity;
    const itemCashback = (product.cashback || 0) * item.quantity;

    subtotal += itemTotal;
    totalCashback += itemCashback;

    // Handle vendor - could be ObjectId or populated object
    const vendorId = product.vendor && typeof product.vendor === 'object' && product.vendor._id
      ? product.vendor._id
      : product.vendor;

    // Handle thumbnail - ensure it's an object or undefined, not null
    let thumbnail = undefined;
    if (product.thumbnail && typeof product.thumbnail === 'object') {
      thumbnail = {
        url: product.thumbnail.url || undefined,
        publicId: product.thumbnail.publicId || undefined,
      };
      // Only set thumbnail if it has at least a URL
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    }

    itemsWithDetails.push({
      product: product._id,
      vendor: vendorId,
      productName: product.productName,
      thumbnail: thumbnail,
      quantity: item.quantity,
      unitPrice: product.actualPrice,
      salePrice: unitPrice,
      totalPrice: itemTotal,
      cashback: itemCashback,
      sku: item.sku,
    });
  }

  // Calculate discount from coupon
  let discount = 0;
  if (this.coupon && this.coupon.couponId) {
    const coupon = await Coupon.findById(this.coupon.couponId);
    if (coupon && coupon.isValid()) {
      const discountResult = coupon.calculateDiscount(subtotal);
      if (discountResult.valid) {
        discount = discountResult.discount;
      }
    }
  }

  // Calculate shipping (can be customized based on business logic)
  const shipping = subtotal >= 500 ? 0 : 50; // Free shipping above ₹500

  // Calculate tax (GST - 5% for example, can be customized)
  const tax = (subtotal - discount) * 0.05;

  const total = subtotal - discount + shipping + tax;

  return {
    items: itemsWithDetails,
    unavailableItems: unavailableItems,
    pricing: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      totalCashback: parseFloat(totalCashback.toFixed(2)),
    },
  };
};

module.exports = mongoose.model('Cart', CartSchema);


