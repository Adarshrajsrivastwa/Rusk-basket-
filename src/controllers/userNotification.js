const User = require('../models/User');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { sendPushNotification } = require('../utils/firebaseNotification');

/**
 * Update FCM token for user
 */
exports.updateFCMToken = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const { token, deviceId, platform } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update single fcmToken (for backward compatibility)
    if (token) {
      user.fcmToken = token;
    }

    // Add to fcmTokens array if not already present
    if (token && user.fcmTokens) {
      const existingTokenIndex = user.fcmTokens.findIndex(
        t => t.token === token
      );

      if (existingTokenIndex === -1) {
        // Add new token
        user.fcmTokens.push({
          token: token,
          deviceId: deviceId || '',
          platform: platform || 'android',
        });
      } else {
        // Update existing token
        user.fcmTokens[existingTokenIndex].deviceId = deviceId || user.fcmTokens[existingTokenIndex].deviceId;
        user.fcmTokens[existingTokenIndex].platform = platform || user.fcmTokens[existingTokenIndex].platform;
        user.fcmTokens[existingTokenIndex].createdAt = new Date();
      }
    } else if (token) {
      // Initialize fcmTokens array if it doesn't exist
      user.fcmTokens = [{
        token: token,
        deviceId: deviceId || '',
        platform: platform || 'android',
      }];
    }

    await user.save();

    logger.info(`FCM token updated for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'FCM token updated successfully',
    });
  } catch (error) {
    logger.error('Update FCM token error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update FCM token',
    });
  }
};

/**
 * Remove FCM token
 */
exports.removeFCMToken = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const { token } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Remove from fcmToken if it matches
    if (user.fcmToken === token) {
      user.fcmToken = undefined;
    }

    // Remove from fcmTokens array
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      user.fcmTokens = user.fcmTokens.filter(t => t.token !== token);
    }

    await user.save();

    logger.info(`FCM token removed for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'FCM token removed successfully',
    });
  } catch (error) {
    logger.error('Remove FCM token error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to remove FCM token',
    });
  }
};

/**
 * Test push notification (for testing)
 */
exports.testNotification = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await sendPushNotification(userId, {
      title: 'Test Notification',
      message: 'This is a test push notification from Rush Baskets',
      type: 'test',
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Test notification sent successfully',
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to send test notification',
      });
    }
  } catch (error) {
    logger.error('Test notification error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to send test notification',
    });
  }
};
