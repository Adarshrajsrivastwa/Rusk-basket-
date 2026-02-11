const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const AdminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
  },
  mobile: {
    type: String,
    required: [true, 'Please add a mobile number'],
    unique: true,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please add a valid 10-digit mobile number'],
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  otp: {
    code: String,
    expiresAt: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: Date,
  // Company Logo & Branding
  companyLogo: {
    type: String,
    trim: true,
  },
  // Profile Image
  profileImage: {
    url: {
      type: String,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
  },
  // Basic Information
  companyName: {
    type: String,
    trim: true,
  },
  legalName: {
    type: String,
    trim: true,
  },
  // Contact Details
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if value is provided
        if (!v || v.length === 0) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Please provide a valid website URL',
    },
  },
  alternatePhone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if value is provided
        if (!v || v.length === 0) return true;
        return /^[0-9]{10}$/.test(v);
      },
      message: 'Please add a valid 10-digit phone number',
    },
  },
  contactPerson: {
    type: String,
    trim: true,
  },
  designation: {
    type: String,
    trim: true,
  },
  // Banking Information
  bankName: {
    type: String,
    trim: true,
  },
  branchName: {
    type: String,
    trim: true,
  },
  accountNumber: {
    type: String,
    trim: true,
  },
  ifscCode: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if value is provided
        if (!v || v.length === 0) return true;
        return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
      },
      message: 'Please provide a valid IFSC code',
    },
  },
  // Legal & Registration Details
  foundedYear: {
    type: Number,
    min: [1800, 'Founded year must be after 1800'],
    max: [new Date().getFullYear(), 'Founded year cannot be in the future'],
  },
  registrationNumber: {
    type: String,
    trim: true,
  },
  gstNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if value is provided
        if (!v || v.length === 0) return true;
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Please provide a valid GST number',
    },
  },
  panNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Only validate if value is provided
        if (!v || v.length === 0) return true;
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
      },
      message: 'Please provide a valid PAN number',
    },
  },
  // Vision & Mission
  vision: {
    type: String,
    trim: true,
  },
  mission: {
    type: String,
    trim: true,
  },
  // Office Address
  officeAddress: {
    streetAddress: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          // Only validate if value is provided
          if (!v || v.length === 0) return true;
          return /^[0-9]{6}$/.test(v);
        },
        message: 'Please provide a valid 6-digit pincode',
      },
    },
    country: {
      type: String,
      trim: true,
      default: 'India',
    },
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
  },
  // Verification Status
  verificationStatus: {
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
  },
  // Key Metrics (can be calculated or stored)
  keyMetrics: {
    yearsInBusiness: {
      type: Number,
      default: 0,
    },
    totalEmployees: {
      type: Number,
      default: 0,
    },
    activeClients: {
      type: Number,
      default: 0,
    },
    totalLeads: {
      type: Number,
      default: 0,
    },
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

AdminSchema.methods.generateOTP = function () {
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  this.otp = {
    code: otpCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  return otpCode;
};

AdminSchema.methods.verifyOTP = function (enteredOTP) {
  if (!this.otp || !this.otp.code) {
    return false;
  }
  if (this.otp.expiresAt < new Date()) {
    return false;
  }
  return this.otp.code === enteredOTP;
};

AdminSchema.methods.clearOTP = function () {
  this.otp = undefined;
};

AdminSchema.methods.getSignedJwtToken = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Please set JWT_SECRET in environment variables.');
  }
  return jwt.sign({ id: this._id, role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = mongoose.model('Admin', AdminSchema);









