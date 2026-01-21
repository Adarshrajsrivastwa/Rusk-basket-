const Rider = require('../models/Rider');
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

    const { mobileNumber } = req.body;

    let rider = await Rider.findOne({ mobileNumber });

    if (rider && rider.mobileNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Rider with this mobile number already exists and is verified',
      });
    }

    if (!rider) {
      rider = new Rider({ mobileNumber });
    }

    const otpCode = rider.generateOTP();
    await rider.save({ validateBeforeSave: false });

    try {
      await sendOTP(mobileNumber, otpCode);
      logger.info(`OTP sent to rider mobile number: ${mobileNumber}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your mobile number',
        mobileNumber: mobileNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
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

    const { mobileNumber, otp } = req.body;

    const rider = await Rider.findOne({ mobileNumber });

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found. Please request OTP first.',
      });
    }

    const isValidOTP = rider.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    rider.mobileNumberVerified = true;
    rider.clearOTP();
    await rider.save({ validateBeforeSave: false });

    const token = rider.getSignedJwtToken();

    setTokenCookie(res, token, req);

    logger.info(`Rider mobile number verified: ${mobileNumber}`);

    res.status(200).json({
      success: true,
      message: 'Mobile number verified successfully',
      token,
      data: {
        id: rider._id,
        mobileNumber: rider.mobileNumber,
        approvalStatus: rider.approvalStatus,
        role: 'rider',
      },
    });
  } catch (error) {
    logger.error('Verify OTP error:', error);
    next(error);
  }
};


