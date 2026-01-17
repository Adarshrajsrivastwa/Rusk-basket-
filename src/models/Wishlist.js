const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema({
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
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

WishlistSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

WishlistSchema.methods.getWishlistWithDetails = async function () {
  const Product = mongoose.model('Product');
  
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
        productId: item.product,
        reason: 'Product not found',
      });
      continue;
    }

    if (!product.vendor || !product.vendor.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productId: product._id,
        productName: product.productName,
        reason: 'Vendor is inactive',
      });
      continue;
    }

    if (!product.isActive) {
      unavailableItems.push({
        itemId: item._id,
        productId: product._id,
        productName: product.productName,
        reason: 'Product is inactive',
      });
      continue;
    }

    const approvalStatus = product.approvalStatus ? String(product.approvalStatus).trim().toLowerCase() : null;

    if (!approvalStatus || approvalStatus !== 'approved') {
      const statusMessages = {
        'pending': 'Product is pending approval',
        'rejected': 'Product has been rejected',
      };
      unavailableItems.push({
        itemId: item._id,
        productId: product._id,
        productName: product.productName,
        reason: statusMessages[approvalStatus] || `Product status is ${product.approvalStatus}`,
      });
      continue;
    }

    const vendorId = product.vendor && typeof product.vendor === 'object' && product.vendor._id
      ? product.vendor._id
      : product.vendor;

    let thumbnail = undefined;
    if (product.images && product.images.length > 0 && product.images[0].url) {
      thumbnail = {
        url: product.images[0].url || undefined,
        publicId: product.images[0].publicId || undefined,
      };
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    } else if (product.thumbnail && typeof product.thumbnail === 'object' && product.thumbnail.url) {
      thumbnail = {
        url: product.thumbnail.url || undefined,
        publicId: product.thumbnail.publicId || undefined,
      };
      if (!thumbnail.url) {
        thumbnail = undefined;
      }
    }

    itemsWithDetails.push({
      itemId: item._id,
      product: {
        _id: product._id,
        productName: product.productName,
        productType: product.productType,
        category: product.category,
        subCategory: product.subCategory,
        thumbnail: thumbnail,
        images: product.images,
        description: product.description,
        actualPrice: product.actualPrice,
        regularPrice: product.regularPrice,
        salePrice: product.salePrice,
        cashback: product.cashback || 0,
        discount: product.discount || 0,
        skuHsn: product.skuHsn,
        skus: product.skus,
        inventory: product.inventory,
        vendor: vendorId,
        isActive: product.isActive,
        approvalStatus: product.approvalStatus,
      },
      addedAt: item.addedAt,
    });
  }

  return {
    items: itemsWithDetails,
    unavailableItems: unavailableItems,
    totalItems: itemsWithDetails.length,
  };
};

module.exports = mongoose.model('Wishlist', WishlistSchema);
