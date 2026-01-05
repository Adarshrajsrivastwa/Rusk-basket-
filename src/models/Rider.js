const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

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
  documents: {
    profile: {
      url: String,
      publicId: String,
    },
    aadharCard: {
      url: String,
      publicId: String,
    },
    panCard: {
      url: String,
      publicId: String,
    },
    drivingLicense: {
      url: String,
      publicId: String,
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
    ref: 'SuperAdmin',
  },
  approvedAt: {
    type: Date,
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
  return jwt.sign({ id: this._id, role: 'rider' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = mongoose.model('Rider', RiderSchema);

