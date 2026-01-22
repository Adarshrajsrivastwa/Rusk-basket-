const Rider = require('../models/Rider');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookieHelper');

exports.riderLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobileNumber } = req.body;

    // Check if rider exists
    let rider = await Rider.findOne({ mobileNumber });

    // If rider doesn't exist, create a new one
    if (!rider) {
      rider = new Rider({
        mobileNumber: mobileNumber,
        mobileNumberVerified: true,
        isActive: true,
        approvalStatus: 'pending',
      });
      await rider.save({ validateBeforeSave: false });
      logger.info(`New rider created with mobile number: ${mobileNumber}`);
    }

    // Check if rider account is deactivated
    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    // Generate and send OTP
    const otpCode = rider.generateOTP();
    await rider.save({ validateBeforeSave: false });

    try {
      await sendOTP(mobileNumber, otpCode);
      logger.info(`OTP generated and sent to Rider: ${mobileNumber}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your mobile number',
        mobileNumber: mobileNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        isNewRider: !rider.fullName, // Indicate if this is a new rider (no profile completed)
        otp: otpCode,
      });
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      rider.clearOTP();
      await rider.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    logger.error('Rider login error:', error);
    
    // Handle duplicate key error (mobile number already exists)
    if (error.code === 11000 && error.keyPattern?.mobileNumber) {
      // Retry by finding the existing rider
      try {
        const { mobileNumber } = req.body;
        const rider = await Rider.findOne({ mobileNumber });
        
        if (rider && rider.isActive) {
          const otpCode = rider.generateOTP();
          await rider.save({ validateBeforeSave: false });
          
          try {
            await sendOTP(mobileNumber, otpCode);
            return res.status(200).json({
              success: true,
              message: 'OTP sent to your mobile number',
              mobileNumber: mobileNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
              isNewRider: !rider.fullName,
              otp: otpCode,
            });
          } catch (smsError) {
            logger.error('Failed to send OTP on retry:', smsError);
            rider.clearOTP();
            await rider.save({ validateBeforeSave: false });
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

exports.riderVerifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobileNumber, otp } = req.body;

    const rider = await Rider.findOne({ mobileNumber });

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    const isValidOTP = rider.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    rider.clearOTP();
    await rider.save({ validateBeforeSave: false });

    const token = rider.getSignedJwtToken();

    setTokenCookie(res, token);

    logger.info(`Rider logged in successfully: ${mobileNumber}`);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: rider._id,
        fullName: rider.fullName,
        mobileNumber: rider.mobileNumber,
        approvalStatus: rider.approvalStatus,
        role: 'rider',
      },
    });
  } catch (error) {
    logger.error('Rider OTP verification error:', error);
    next(error);
  }
};

exports.riderLogout = async (req, res, next) => {
  try {
    const riderId = req.rider?._id || req.rider?.id;
    const mobileNumber = req.rider?.mobileNumber;    clearTokenCookie(res);    logger.info(`Rider logged out successfully: ${mobileNumber || riderId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Rider logout error:', error);
    // Even if there's an error, clear the cookie
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};
