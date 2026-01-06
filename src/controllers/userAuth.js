const User = require('../models/User');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie } = require('../utils/cookieHelper');

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

    // Check if user exists
    let user = await User.findOne({ contactNumber });

    // If user doesn't exist, create a new one
    if (!user) {
      user = new User({
        contactNumber: contactNumber,
        contactNumberVerified: false,
        isActive: true,
      });
      await user.save({ validateBeforeSave: false });
      logger.info(`New user created with contact number: ${contactNumber}`);
    }

    // Check if user account is deactivated
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
      });
    }

    // Generate and send OTP
    const otpCode = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP generated and sent to User: ${contactNumber}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your contact number',
        contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        isNewUser: !user.userName, // Indicate if this is a new user (no profile completed)
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
    
    // Handle duplicate key error (contact number already exists)
    if (error.code === 11000 && error.keyPattern?.contactNumber) {
      // Retry by finding the existing user
      try {
        const { contactNumber } = req.body;
        const user = await User.findOne({ contactNumber });
        
        if (user && user.isActive) {
          const otpCode = user.generateOTP();
          await user.save({ validateBeforeSave: false });
          
          try {
            await sendOTP(contactNumber, otpCode);
            return res.status(200).json({
              success: true,
              message: 'OTP sent to your contact number',
              contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
              isNewUser: !user.userName,
            });
          } catch (smsError) {
            logger.error('Failed to send OTP on retry:', smsError);
            user.clearOTP();
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({
              success: false,
              error: 'Failed to send OTP. Please try again.',
            });
          }
        }
      } catch (retryError) {
        logger.error('Retry error:', retryError);
      }
    }
    
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

    // Mark contact number as verified after successful OTP verification
    user.contactNumberVerified = true;
    user.clearOTP();
    await user.save({ validateBeforeSave: false });

    const token = user.getSignedJwtToken();

    logger.info(`User logged in successfully: ${contactNumber}`);
    logger.info(`Setting token cookie for user: ${contactNumber}`);

    setTokenCookie(res, token);

    const responseData = {
      success: true,
      token,
      data: {
        id: user._id,
        userName: user.userName,
        contactNumber: user.contactNumber,
        email: user.email,
        contactNumberVerified: user.contactNumberVerified,
        role: 'user',
      },
    };

    logger.info(`Response headers before send:`, res.getHeaders());
    
    res.status(200).json(responseData);
  } catch (error) {
    logger.error('User OTP verification error:', error);
    next(error);
  }
};
