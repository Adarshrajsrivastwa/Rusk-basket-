const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot be more than 200 characters'],
  },
  productType: {
    type: {
      type: String,
      enum: ['quantity', 'weight', 'volume'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: [0, 'Product type value must be greater than or equal to 0'],
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
  },
  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubCategory',
    required: [true, 'Sub category is required'],
  },
  thumbnail: {
    url: {
      type: String,
    },
    publicId: {
      type: String,
    },
  },
  images: [{
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
  }],
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot be more than 5000 characters'],
  },
  skus: [{
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    inventory: {
      type: Number,
      required: true,
      min: [0, 'Inventory cannot be negative'],
    },
  }],
  inventory: {
    type: Number,
    default: 0,
    min: [0, 'Inventory cannot be negative'],
  },
  skuHsn: {
    type: String,
    trim: true,
    maxlength: [50, 'SKU/HSN code cannot be more than 50 characters'],
  },
  actualPrice: {
    type: Number,
    required: [true, 'Actual price is required'],
    min: [0, 'Actual price must be greater than or equal to 0'],
  },
  regularPrice: {
    type: Number,
    required: [true, 'Regular price is required'],
    min: [0, 'Regular price must be greater than or equal to 0'],
  },
  salePrice: {
    type: Number,
    required: [true, 'Sale price is required'],
    min: [0, 'Sale price must be greater than or equal to 0'],
  },
  cashback: {
    type: Number,
    default: 0,
    min: [0, 'Cashback must be greater than or equal to 0'],
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: [0, 'Discount percentage cannot be negative'],
    max: [100, 'Discount percentage cannot exceed 100'],
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Vendor is required'],
  },
  latitude: {
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90'],
  },
  longitude: {
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180'],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Created by is required'],
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  approvedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot be more than 500 characters'],
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
  },
  updatedByModel: {
    type: String,
    enum: ['Vendor', 'Admin'],
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

ProductSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate discount percentage before saving
  // Only calculate if both regularPrice and salePrice exist
  if (this.regularPrice != null && this.salePrice != null) {
    const regularPrice = parseFloat(this.regularPrice);
    const salePrice = parseFloat(this.salePrice);
    
    if (regularPrice > 0 && salePrice < regularPrice) {
      this.discountPercentage = parseFloat((((regularPrice - salePrice) / regularPrice) * 100).toFixed(2));
    } else {
      this.discountPercentage = 0;
    }
  } else {
    this.discountPercentage = 0;
  }
  
  next();
});

// Text search index for productName and description
ProductSchema.index({ productName: 'text', description: 'text' });

// Other indexes for better query performance
ProductSchema.index({ vendor: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ subCategory: 1 });
ProductSchema.index({ approvalStatus: 1 });
ProductSchema.index({ isActive: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ createdAt: -1 });

// Geospatial index for location-based queries (2dsphere for better accuracy)
ProductSchema.index({ latitude: 1, longitude: 1 });

// Compound index for nearby approved products query
ProductSchema.index({ approvalStatus: 1, isActive: 1, latitude: 1, longitude: 1 });

module.exports = mongoose.model('Product', ProductSchema);
