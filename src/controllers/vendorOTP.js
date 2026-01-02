const Vendor = require('../models/Vendor');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.sendOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber } = req.body;

    let vendor = await Vendor.findOne({ contactNumber });

    if (vendor && vendor.contactNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Vendor with this contact number already exists and is verified',
      });
    }

    if (!vendor) {
      vendor = new Vendor({ contactNumber });
    }

    const otpCode = vendor.generateOTP();
    await vendor.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP sent to vendor contact number: ${contactNumber}`);

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
    logger.error('Send OTP error:', error);
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

    const { contactNumber, otp } = req.body;

    const vendor = await Vendor.findOne({ contactNumber });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found. Please request OTP first.',
      });
    }

    const isValidOTP = vendor.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    vendor.contactNumberVerified = true;
    vendor.clearOTP();
    await vendor.save({ validateBeforeSave: false });

    logger.info(`Vendor contact number verified: ${contactNumber}`);

    res.status(200).json({
      success: true,
      message: 'Contact number verified successfully',
    });
  } catch (error) {
    logger.error('Verify OTP error:', error);
    next(error);
  }
};

