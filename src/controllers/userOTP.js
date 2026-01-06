const User = require('../models/User');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie } = require('../utils/cookieHelper');

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

    let user = await User.findOne({ contactNumber });

    if (user && user.contactNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'User with this contact number already exists and is verified',
      });
    }

    if (!user) {
      user = new User({ contactNumber });
    }

    const otpCode = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP sent to user contact number: ${contactNumber}`);

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

    const user = await User.findOne({ contactNumber });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please request OTP first.',
      });
    }

    const isValidOTP = user.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    user.contactNumberVerified = true;
    user.clearOTP();
    await user.save({ validateBeforeSave: false });

    const token = user.getSignedJwtToken();

    setTokenCookie(res, token);

    logger.info(`User contact number verified: ${contactNumber}`);

    res.status(200).json({
      success: true,
      message: 'Contact number verified successfully',
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
    logger.error('Verify OTP error:', error);
    next(error);
  }
};

