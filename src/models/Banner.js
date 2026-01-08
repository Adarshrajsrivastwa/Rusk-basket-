const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [200, 'Banner name cannot be more than 200 characters'],
  },
  image: {
    url: {
      type: String,
      required: [true, 'Banner image URL is required'],
    },
    publicId: {
      type: String,
      required: [true, 'Banner image publicId is required'],
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
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

BannerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

BannerSchema.index({ isActive: 1 });
BannerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Banner', BannerSchema);

