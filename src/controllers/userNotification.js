const User = require('../models/User');
const Notification = require('../models/Notification');
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
 * Get user notifications
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {
      recipient: userId,
      recipientModel: 'User',
      isActive: true,
    };

    // Filter by read status if provided
    if (req.query.isRead !== undefined) {
      query.isRead = req.query.isRead === 'true';
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('order', 'orderNumber status');

    const total = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    next(error);
  }
};

/**
 * Get unread notifications count
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const count = await Notification.countDocuments({
      recipient: userId,
      recipientModel: 'User',
      isRead: false,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    logger.error('Get unread count error:', error);
    next(error);
  }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId, recipientModel: 'User' },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    logger.error('Mark as read error:', error);
    next(error);
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, recipientModel: 'User', isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error('Mark all as read error:', error);
    next(error);
  }
};

/**
 * Delete a notification
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId, recipientModel: 'User' },
      { isActive: false },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    logger.error('Delete notification error:', error);
    next(error);
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

