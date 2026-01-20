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
    enum: ['pending', 'approved', 'rejected', 'assigned'],
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
  confirmed: {
    type: Boolean,
    default: false,
  },
  confirmedAt: {
    type: Date,
  },
  confirmedForVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
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
  if (this.status === 'assigned' && !this.assignedAt) {
    this.assignedAt = Date.now();
  }
  if (this.confirmed && !this.confirmedAt) {
    this.confirmedAt = Date.now();
  }
  next();
});

module.exports = mongoose.model('RiderJobApplication', RiderJobApplicationSchema);

