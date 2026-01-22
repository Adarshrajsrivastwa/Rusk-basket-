const Vendor = require('../models/Vendor');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookieHelper');

exports.vendorLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber } = req.body;

    const vendor = await Vendor.findOne({ contactNumber });

    if (!vendor) {
      return res.status(401).json({
        success: false,
        error: 'Vendor not found with this contact number',
      });
    }

    if (!vendor.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Vendor account is deactivated',
      });
    }

    if (!vendor.storeId) {
      return res.status(400).json({
        success: false,
        error: 'Vendor registration not completed',
      });
    }

    const otpCode = vendor.generateOTP();
    await vendor.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP generated and sent to Vendor: ${contactNumber}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your contact number',
        contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
      });
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      vendor.clearOTP();
      await vendor.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    logger.error('Vendor login error:', error);
    next(error);
  }
};

exports.vendorVerifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber, otp } = req.body;

    const vendor = await Vendor.findOne({ contactNumber });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    if (!vendor.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Vendor account is deactivated',
      });
    }

    const isValidOTP = vendor.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    vendor.clearOTP();
    await vendor.save({ validateBeforeSave: false });

    const token = vendor.getSignedJwtToken();

    setTokenCookie(res, token);

    logger.info(`Vendor logged in successfully: ${contactNumber}`);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: vendor._id,
        vendorName: vendor.vendorName,
        contactNumber: vendor.contactNumber,
        email: vendor.email,
        storeId: vendor.storeId,
        storeName: vendor.storeName,
        role: 'vendor',
        permissions: vendor.permissions,
      },
    });
  } catch (error) {
    logger.error('Vendor OTP verification error:', error);
    next(error);
  }
};

exports.vendorLogout = async (req, res, next) => {
  try {
    const vendorId = req.vendor?._id || req.vendor?.id;
    const contactNumber = req.vendor?.contactNumber;
    const storeId = req.vendor?.storeId;    clearTokenCookie(res);    logger.info(`Vendor logged out successfully: ${contactNumber || storeId || vendorId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Vendor logout error:', error);
    // Even if there's an error, clear the cookie
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};
