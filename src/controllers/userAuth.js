const User = require('../models/User');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.userLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber } = req.body;

    const user = await User.findOne({ contactNumber });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found with this contact number',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
      });
    }

    const otpCode = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP generated and sent to User: ${contactNumber}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your contact number',
        contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
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
    logger.error('User login error:', error);
    next(error);
  }
};

exports.userVerifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber, otp } = req.body;

    const user = await User.findOne({ contactNumber });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
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
    await user.save({ validateBeforeSave: false });

    const token = user.getSignedJwtToken();

    logger.info(`User logged in successfully: ${contactNumber}`);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: user._id,
        userName: user.userName,
        contactNumber: user.contactNumber,
        email: user.email,
        role: 'user',
      },
    });
  } catch (error) {
    logger.error('User OTP verification error:', error);
    next(error);
  }
};

