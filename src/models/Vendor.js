const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const VendorSchema = new mongoose.Schema({
  vendorName: {
    type: String,
    required: function() {
      return !!this.storeId;
    },
    trim: true,
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    unique: true,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit contact number'],
  },
  contactNumberVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    code: String,
    expiresAt: Date,
  },
  altContactNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit contact number'],
  },
  email: {
    type: String,
    required: function() {
      return !!this.storeId;
    },
    unique: true,
    sparse: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: function() {
      return !!this.storeId;
    },
  },
  dateOfBirth: {
    type: Date,
    required: function() {
      return !!this.storeId;
    },
  },
  age: {
    type: Number,
  },
  storeId: {
    type: String,
    unique: true,
    sparse: true,
  },
  storeName: {
    type: String,
    required: function() {
      return !!this.storeId;
    },
    trim: true,
  },
  storeImage: [{
    url: String,
    publicId: String,
  }],
  storeAddress: {
    line1: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
    },
    line2: String,
    pinCode: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
      match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit PIN code'],
    },
    city: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
    },
    state: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
    },
    latitude: Number,
    longitude: Number,
  },
  documents: {
    panCard: {
      url: String,
      publicId: String,
    },
    aadharCard: {
      url: String,
      publicId: String,
    },
    drivingLicense: {
      url: String,
      publicId: String,
    },
  },
  bankDetails: {
    ifsc: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
      trim: true,
      uppercase: true,
    },
    accountNumber: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
      trim: true,
    },
    bankName: {
      type: String,
      required: function() {
        return !!this.storeId;
      },
      trim: true,
    },
    cancelCheque: {
      url: String,
      publicId: String,
    },
  },
  permissions: {
    canManageProducts: {
      type: Boolean,
      default: false,
    },
    canManageOrders: {
      type: Boolean,
      default: false,
    },
    canManageInventory: {
      type: Boolean,
      default: false,
    },
    canViewAnalytics: {
      type: Boolean,
      default: false,
    },
    canManageDiscounts: {
      type: Boolean,
      default: false,
    },
    canManagePromotions: {
      type: Boolean,
      default: false,
    },
    canExportData: {
      type: Boolean,
      default: false,
    },
    canManageReviews: {
      type: Boolean,
      default: false,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  serviceRadius: {
    type: Number,
    default: 5,
    min: [0.1, 'Service radius must be at least 0.1 km'],
    required: function() {
      return !!this.storeId;
    },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: function() {
      return !!this.storeId;
    },
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

VendorSchema.pre('save', function (next) {
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
  this.updatedAt = Date.now();
  next();
});

VendorSchema.methods.generateOTP = function () {
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  this.otp = {
    code: otpCode,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
  return otpCode;
};

VendorSchema.methods.verifyOTP = function (enteredOTP) {
  if (!this.otp || !this.otp.code) {
    return false;
  }
  if (this.otp.expiresAt < new Date()) {
    return false;
  }
  return this.otp.code === enteredOTP;
};

VendorSchema.methods.clearOTP = function () {
  this.otp = undefined;
};

VendorSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id, role: 'vendor' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

VendorSchema.statics.generateStoreId = async function () {
  let storeId;
  let exists = true;
  while (exists) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    storeId = `RB${randomNum}`;
    const vendor = await this.findOne({ storeId });
    if (!vendor) {
      exists = false;
    }
  }
  return storeId;
};

module.exports = mongoose.model('Vendor', VendorSchema);

