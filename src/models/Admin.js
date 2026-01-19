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









