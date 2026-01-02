const mongoose = require('mongoose');

const SubCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'SubCategory name is required'],
    trim: true,
    maxlength: [100, 'SubCategory name cannot be more than 100 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters'],
  },
  image: {
    url: String,
    publicId: String,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Parent category is required'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
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

SubCategorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

SubCategorySchema.index({ category: 1 });
SubCategorySchema.index({ isActive: 1 });
SubCategorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('SubCategory', SubCategorySchema);

