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
      user = new User({ 
        contactNumber,
        // Email is optional - don't set it at all
      });
      
      // Ensure email is not included in the document
      user.email = undefined;
      
      try {
        await user.save({ validateBeforeSave: false });
      } catch (saveError) {
        // Handle duplicate key error for email (E11000) - auto-fix
        if (saveError.code === 11000 && (saveError.keyPattern?.email || saveError.message?.includes('email'))) {
          logger.warn(`Email index issue detected, attempting to fix: ${contactNumber}`);
          
          try {
            // Try to fix the index issue
            const mongoose = require('mongoose');
            const db = mongoose.connection.db;
            if (db) {
              try {
                await db.collection('users').dropIndex('email_1');
                logger.info('Dropped problematic email index');
              } catch (dropError) {
                if (dropError.code !== 27) {
                  logger.error('Error dropping email index:', dropError);
                }
              }
            }
            
            // Retry user creation
            user = new User({ 
              contactNumber,
            });
            user.email = undefined;
            await user.save({ validateBeforeSave: false });
          } catch (retryError) {
            logger.error('Error retrying user creation:', retryError);
            throw saveError; // Throw original error
          }
        } else {
          throw saveError;
        }
      }
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
        otp: otpCode, // Include OTP in response for all users
      });
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      // Still return OTP in response even if SMS fails (for development/testing)
      res.status(200).json({
        success: true,
        message: 'OTP generated (SMS sending failed, but OTP is available)',
        contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        otp: otpCode, // Include OTP in response
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

