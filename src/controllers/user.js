const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateUserProfileData } = require('../services/userService');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get user profile error:', error);
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.contactNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Please verify your contact number first',
      });
    }

    const { email } = req.body;
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ 
        email, 
        _id: { $ne: user._id } 
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists',
        });
      }
    }

    await updateUserProfileData(user, req.body, req.file);
    await user.save();

    logger.info(`User profile updated: ${user.contactNumber} (ID: ${user._id})`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    logger.error('Update user profile error:', error);
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

