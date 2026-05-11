const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { JOB_APPLIED_VALUES } = require('../utils/riderJobApplied');

const RiderSchema = new mongoose.Schema({
  fullName: {
    type: String,
    trim: true,
  },
  fathersName: {
    type: String,
    trim: true,
  },
  mothersName: {
    type: String,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
  },
  age: {
    type: Number,
  },
  mobileNumber: {
    type: String,
    required: [true, 'Mobile number is required'],
    unique: true,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit mobile number'],
  },
  mobileNumberVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    code: String,
    expiresAt: Date,
  },
  whatsappNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit WhatsApp number'],
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  city: {
    type: String,
    trim: true,
  },
  currentAddress: {
    line1: {
      type: String,
      trim: true,
    },
    line2: {
      type: String,
      trim: true,
    },
    pinCode: {
      type: String,
      match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit PIN code'],
    },
    city: String,
    state: String,
    latitude: Number,
    longitude: Number,
  },
  language: {
    type: [String],
    default: [],
  },
  emergencyContactPerson: {
    name: {
      type: String,
      trim: true,
    },
    relation: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit contact number'],
    },
  },
  emergencyContactNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit contact number'],
  },
  workDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  kyc: {
    type: Boolean,
    default: false,
  },
  jobApplied: {
    type: String,
    default: 'none',
    trim: true,
  },
  documents: {
    profile: {
      url: String,
      publicId: String,
    },
    aadharCard: {
      aadharId: {
        type: String,
        trim: true,
      },
      photo: {
        url: String,
        publicId: String,
      },
    },
    panCard: {
      front: {
        url: String,
        publicId: String,
      },
      back: {
        url: String,
        publicId: String,
      },
    },
    drivingLicense: {
      front: {
        url: String,
        publicId: String,
      },
      back: {
        url: String,
        publicId: String,
      },
    },
    bankDetails: {
      accountNumber: {
        type: String,
        trim: true,
      },
      ifsc: {
        type: String,
        trim: true,
        uppercase: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
      branchName: {
        type: String,
        trim: true,
      },
      accountHolderName: {
        type: String,
        trim: true,
      },
      cancelCheque: {
        url: String,
        publicId: String,
      },
    },
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
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    index: true,
  },
  assignedToVendorAt: {
    type: Date,
  },
  fcmToken: {
    type: String,
    trim: true,
  },
  fcmTokens: [{
    token: {
      type: String,
      required: true,
      trim: true,
    },
    deviceId: {
      type: String,
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  dueBalance: {
    type: Number,
    default: 0,
    min: [0, 'Due balance cannot be negative'],
  },
  pendingBalance: {
    type: Number,
    default: 0,
    min: [0, 'Pending balance cannot be negative'],
  },
  earningWallet: {
    type: Number,
    default: 0,
    min: [0, 'Earning wallet cannot be negative'],
  },
  // Commission System - Rider-wise commission settings
  commission: {
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'hybrid', 'subscription'],
      default: 'percentage',
    },
    percentage: {
      type: Number,
      default: 10,
      min: [0, 'Commission percentage must be greater than or equal to 0'],
      max: [100, 'Commission percentage cannot exceed 100'],
    },
    fixedAmount: {
      type: Number,
      default: 0,
      min: [0, 'Fixed commission amount must be greater than or equal to 0'],
    },
    subscriptionAmount: {
      type: Number,
      default: 0,
      min: [0, 'Subscription amount must be greater than or equal to 0'],
    },
    subscriptionPeriod: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    subscriptionDeductionDate: { // Day of month (1-31) for monthly, day of year (1-365) for yearly
      type: Number,
      default: null,
    },
    lastSubscriptionDeduction: {
      type: Date,
      default: null,
    },
    nextSubscriptionDeduction: {
      type: Date,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  walletTransactions: [{
    type: {
      type: String,
      enum: ['credit', 'debit', 'reset'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be greater than or equal to 0'],
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    orderNumber: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Referral system
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider',
    default: null,
  },
  referralCount: {
    type: Number,
    default: 0,
    min: [0, 'Referral count cannot be negative'],
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

RiderSchema.pre('validate', function (next) {
  const v = this.jobApplied;
  if (typeof v === 'boolean') {
    this.jobApplied = v ? 'pending' : 'none';
    return next();
  }
  if (v === '') {
    this.jobApplied = 'none';
    return next();
  }
  if (v != null) {
    const s = String(v).trim();
    if (s === 'true') this.jobApplied = 'pending';
    else if (s === 'false') this.jobApplied = 'none';
    else if (!JOB_APPLIED_VALUES.includes(s)) this.jobApplied = 'none';
  }
  next();
});

RiderSchema.pre('save', function (next) {
  if (this.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    this.age = age;
  }
  
  // Generate referral code if not exists (will be made unique by index)
  if (!this.referralCode && this.isNew) {
    // Generate referral code: RIDER + random string
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.referralCode = `RIDER${randomStr}`;
  }
  
  this.updatedAt = Date.now();
  next();
});

RiderSchema.methods.generateOTP = function () {
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  this.otp = {
    code: otpCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  return otpCode;
};

RiderSchema.methods.verifyOTP = function (enteredOTP) {
  if (!this.otp || !this.otp.code) {
    return false;
  }
  if (this.otp.expiresAt < new Date()) {
    return false;
  }
  return this.otp.code === enteredOTP;
};

RiderSchema.methods.clearOTP = function () {
  this.otp = undefined;
};

RiderSchema.methods.getSignedJwtToken = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET in environment variables.');
  }
  return jwt.sign({ id: this._id, role: 'rider' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Indexes for better query performance
RiderSchema.index({ vendor: 1 });
RiderSchema.index({ vendor: 1, isActive: 1, approvalStatus: 1 });
RiderSchema.index({ mobileNumber: 1 });

module.exports = mongoose.model('Rider', RiderSchema);

