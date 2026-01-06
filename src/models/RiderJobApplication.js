const mongoose = require('mongoose');

const RiderJobApplicationSchema = new mongoose.Schema({
  jobPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RiderJobPost',
    required: [true, 'Job post is required'],
  },
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    required: [true, 'Rider is required'],
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
  reviewedAt: {
    type: Date,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot be more than 500 characters'],
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

// Prevent duplicate applications (one rider can only apply once per job)
RiderJobApplicationSchema.index({ jobPost: 1, rider: 1 }, { unique: true });

RiderJobApplicationSchema.index({ rider: 1 });
RiderJobApplicationSchema.index({ jobPost: 1 });
RiderJobApplicationSchema.index({ status: 1 });
RiderJobApplicationSchema.index({ appliedAt: -1 });

RiderJobApplicationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (this.status !== 'pending' && !this.reviewedAt) {
    this.reviewedAt = Date.now();
  }
  next();
});

module.exports = mongoose.model('RiderJobApplication', RiderJobApplicationSchema);

