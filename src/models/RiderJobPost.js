const mongoose = require('mongoose');

const RiderJobPostSchema = new mongoose.Schema({
  jobTitle: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [200, 'Job title cannot be more than 200 characters'],
  },
  joiningBonus: {
    type: Number,
    required: [true, 'Joining bonus is required'],
    min: [0, 'Joining bonus cannot be negative'],
  },
  onboardingFee: {
    type: Number,
    required: [true, 'Onboarding fee is required'],
    min: [0, 'Onboarding fee cannot be negative'],
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Vendor is required'],
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'postedByType',
  },
  postedByType: {
    type: String,
    required: true,
    enum: ['Admin', 'Vendor'],
  },
  location: {
    line1: {
      type: String,
      required: [true, 'Address line 1 is required'],
      trim: true,
    },
    line2: {
      type: String,
      trim: true,
    },
    pinCode: {
      type: String,
      required: [true, 'PIN code is required'],
      match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit PIN code'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
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

RiderJobPostSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

RiderJobPostSchema.index({ vendor: 1 });
RiderJobPostSchema.index({ isActive: 1 });
RiderJobPostSchema.index({ createdAt: -1 });
RiderJobPostSchema.index({ postedBy: 1, postedByType: 1 });
RiderJobPostSchema.index({ 'location.city': 1 });
RiderJobPostSchema.index({ 'location.state': 1 });
RiderJobPostSchema.index({ 'location.pinCode': 1 });
RiderJobPostSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

module.exports = mongoose.model('RiderJobPost', RiderJobPostSchema);

