const SuperAdmin = require('../models/SuperAdmin');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobile } = req.body;

    const superAdmin = await SuperAdmin.findOne({ mobile });

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        error: 'SuperAdmin not found with this mobile number',
      });
    }

    if (!superAdmin.isActive) {
      return res.status(403).json({
        success: false,
        error: 'SuperAdmin account is deactivated',
      });
    }

    const otpCode = superAdmin.generateOTP();
    await superAdmin.save();

    try {
      await sendOTP(mobile, otpCode);
      logger.info(`OTP generated and sent to SuperAdmin: ${mobile}`);

      res.status(200).json({
        success: true,
        message: 'OTP sent to your mobile number',
        mobile: mobile.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
      });
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      superAdmin.clearOTP();
      await superAdmin.save();

      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    logger.error('SuperAdmin login error:', error);
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

    const { mobile, otp } = req.body;

    const superAdmin = await SuperAdmin.findOne({ mobile });

    if (!superAdmin) {
      return res.status(404).json({
        success: false,
        error: 'SuperAdmin not found',
      });
    }

    if (!superAdmin.isActive) {
      return res.status(403).json({
        success: false,
        error: 'SuperAdmin account is deactivated',
      });
    }

    const isValidOTP = superAdmin.verifyOTP(otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    superAdmin.clearOTP();
    superAdmin.lastLogin = new Date();
    await superAdmin.save();

    const token = superAdmin.getSignedJwtToken();

    logger.info(`SuperAdmin logged in successfully: ${mobile}`);

    res.status(200).json({
      success: true,
      token,
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        mobile: superAdmin.mobile,
        email: superAdmin.email,
        role: 'superadmin',
      },
    });
  } catch (error) {
    logger.error('OTP verification error:', error);
    next(error);
  }
};

