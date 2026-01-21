const Admin = require('../models/Admin');
const Vendor = require('../models/Vendor');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { clearTokenCookie } = require('../utils/cookieHelper');

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobile, role } = req.body;

    // Validate role
    if (!role || !['admin', 'vendor'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Role must be either "admin" or "vendor"',
      });
    }

    if (!mobile) {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required',
      });
    }

    let user;

    if (role === 'admin') {
      user = await Admin.findOne({ mobile: mobile });
    } else if (role === 'vendor') {
      user = await Vendor.findOne({ contactNumber: mobile });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: `${role === 'admin' ? 'Admin' : 'Vendor'} not found with this mobile number`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: `${role === 'admin' ? 'Admin' : 'Vendor'} account is deactivated`,
      });
    }

    // Additional check for vendor
    if (role === 'vendor' && !user.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor registration not completed',
      });
    }

    const otpCode = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    try {
      await sendOTP(mobile, otpCode);
      logger.info(`OTP generated and sent to ${role}: ${mobile}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your mobile number',
        mobile: mobile.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        otp: otpCode, // Include OTP in response
        role: role,
      });
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      user.clearOTP();
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    logger.error('Unified login error:', error);
    next(error);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobile, otp, role } = req.body;

    // Validate role
    if (!role || !['admin', 'vendor'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Role must be either "admin" or "vendor"',
      });
    }

    if (!mobile) {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required',
      });
    }

    let user;

    if (role === 'admin') {
      user = await Admin.findOne({ mobile: mobile });
    } else if (role === 'vendor') {
      user = await Vendor.findOne({ contactNumber: mobile });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `${role === 'admin' ? 'Admin' : 'Vendor'} not found`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: `${role === 'admin' ? 'Admin' : 'Vendor'} account is deactivated`,
      });
    }

    // Additional check for vendor
    if (role === 'vendor' && !user.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor registration not completed',
      });
    }

    const isValidOTP = user.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    user.clearOTP();
    if (role === 'admin') {
      user.lastLogin = new Date();
    }
    await user.save({ validateBeforeSave: false });

    const token = user.getSignedJwtToken();

    const { setTokenCookie } = require('../utils/cookieHelper');
    setTokenCookie(res, token, req);

    logger.info(`${role === 'admin' ? 'Admin' : 'Vendor'} logged in successfully: ${mobile}`);

    // Prepare response data based on role
    let responseData = {
      id: user._id,
      role: role,
    };

    if (role === 'admin') {
      responseData = {
        ...responseData,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
      };
    } else if (role === 'vendor') {
      responseData = {
        ...responseData,
        vendorName: user.vendorName,
        contactNumber: user.contactNumber,
        email: user.email,
        storeId: user.storeId,
        storeName: user.storeName,
        permissions: user.permissions,
      };
    }

    res.status(200).json({
      success: true,
      token, // Still return token in response for flexibility
      data: responseData,
    });
  } catch (error) {
    logger.error('Unified OTP verification error:', error);
    next(error);
  }
};

exports.adminLogout = async (req, res, next) => {
  try {
    const adminId = req.admin?._id || req.admin?.id;
    const mobile = req.admin?.mobile;
    const name = req.admin?.name;

    clearTokenCookie(res);

    logger.info(`Admin logged out successfully: ${name || mobile || adminId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Admin logout error:', error);
    // Even if there's an error, clear the cookie
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};
