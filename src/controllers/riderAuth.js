const Rider = require('../models/Rider');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

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

    const rider = await Rider.findOne({ mobileNumber });

    if (!rider) {
      return res.status(401).json({
        success: false,
        error: 'Rider not found with this mobile number',
      });
    }

    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    const otpCode = rider.generateOTP();
    await rider.save({ validateBeforeSave: false });

    try {
      await sendOTP(mobileNumber, otpCode);
      logger.info(`OTP generated and sent to Rider: ${mobileNumber}`);

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
    logger.error('Rider login error:', error);
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

