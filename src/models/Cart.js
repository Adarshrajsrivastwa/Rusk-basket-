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
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      min: [0, 'Total price cannot be negative'],
    },
    thumbnail: {
      url: {
        type: String,
      },
      publicId: {
        type: String,
      },
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
  totalPrice: {
    type: Number,
    default: 0,
    min: [0, 'Total price cannot be negative'],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

CartSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  let itemsTotal = 0;
  if (this.items && this.items.length > 0) {
    itemsTotal = this.items.reduce((sum, item) => {
      return sum + (item.totalPrice || (item.unitPrice || item.price || 0) * item.quantity || 0);
    }, 0);
  }
  
  this.totalPrice = itemsTotal;
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

    const unitPrice = item.unitPrice || item.price || (product.salePrice || product.regularPrice || product.actualPrice);
    const itemTotal = item.totalPrice || (unitPrice * item.quantity);
    const itemCashback = (product.cashback || 0) * item.quantity;

    subtotal += itemTotal;
    totalCashback += itemCashback;

    const vendorId = product.vendor && typeof product.vendor === 'object' && product.vendor._id
      ? product.vendor._id
      : product.vendor;

    let thumbnail = undefined;
    if (item.thumbnail && item.thumbnail.url) {
      thumbnail = {
        url: item.thumbnail.url,
        publicId: item.thumbnail.publicId || undefined,
      };
    } else if (product.images && product.images.length > 0 && product.images[0].url) {
      // Use first image from images array
      thumbnail = {
        url: product.images[0].url || undefined,
        publicId: product.images[0].publicId || undefined,
      };
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    } else if (product.thumbnail && typeof product.thumbnail === 'object' && product.thumbnail.url) {
      // Fall back to thumbnail if no images are available
      thumbnail = {
        url: product.thumbnail.url || undefined,
        publicId: product.thumbnail.publicId || undefined,
      };
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
      unitPrice: unitPrice,
      salePrice: unitPrice,
      price: unitPrice,
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

  // Calculate handling charge based on vendor's handling charge percentage
  // Get unique vendor IDs from items
  const vendorIds = [];
  itemsWithDetails.forEach(item => {
    const vendorId = item.vendor?.toString() || item.vendor;
    if (vendorId && !vendorIds.includes(vendorId)) {
      vendorIds.push(vendorId);
    }
  });

  // Fetch vendors with handling charge percentages
  const Vendor = mongoose.model('Vendor');
  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id handlingChargePercentage');
  const vendorHandlingChargeMap = new Map();
  vendors.forEach(vendor => {
    vendorHandlingChargeMap.set(vendor._id.toString(), vendor.handlingChargePercentage || 0);
  });

  // Group items by vendor and calculate handling charge
  const vendorItemsMap = new Map();
  itemsWithDetails.forEach(item => {
    const vendorId = item.vendor?.toString() || item.vendor;
    if (vendorId) {
      if (!vendorItemsMap.has(vendorId)) {
        vendorItemsMap.set(vendorId, []);
      }
      vendorItemsMap.get(vendorId).push(item);
    }
  });

  let totalHandlingCharge = 0;
  vendorItemsMap.forEach((items, vendorId) => {
    const handlingChargePercentage = vendorHandlingChargeMap.get(vendorId) || 0;
    if (handlingChargePercentage > 0) {
      const vendorItemsSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const vendorHandlingCharge = (vendorItemsSubtotal * handlingChargePercentage) / 100;
      totalHandlingCharge += vendorHandlingCharge;
    }
  });

  // Calculate tax (GST - 5% for example, can be customized)
  const tax = (subtotal - discount) * 0.05;

  const total = subtotal - discount + tax + totalHandlingCharge;

  this.totalPrice = parseFloat(total.toFixed(2));
  await this.save();

  return {
    items: itemsWithDetails,
    unavailableItems: unavailableItems,
    pricing: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      handlingCharge: parseFloat(totalHandlingCharge.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      totalCashback: parseFloat(totalCashback.toFixed(2)),
    },
  };
};

module.exports = mongoose.model('Cart', CartSchema);







