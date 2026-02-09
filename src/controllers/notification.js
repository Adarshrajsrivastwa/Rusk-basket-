const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Get vendor notifications
 */
exports.getVendorNotifications = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const { page = 1, limit = 20, isRead, type } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {
      recipient: vendorId,
      recipientModel: 'Vendor',
      isActive: true,
    };

    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .populate('order', 'orderNumber status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: vendorId,
      recipientModel: 'Vendor',
      isActive: true,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: notifications,
    });
  } catch (error) {
    logger.error('Get vendor notifications error:', error);
    next(error);
  }
};

/**
 * Mark notification as read
 */
exports.markNotificationAsRead = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const { notificationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification ID format',
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: vendorId,
      recipientModel: 'Vendor',
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification,
    });
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    next(error);
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;

    const result = await Notification.updateMany(
      {
        recipient: vendorId,
        recipientModel: 'Vendor',
        isActive: true,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error('Mark all notifications as read error:', error);
    next(error);
  }
};

/**
 * Delete notification
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;
    const { notificationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification ID format',
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: vendorId,
      recipientModel: 'Vendor',
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    // Soft delete - set isActive to false
    notification.isActive = false;
    await notification.save();

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
 * Delete all notifications
 */
exports.deleteAllNotifications = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;

    const result = await Notification.updateMany(
      {
        recipient: vendorId,
        recipientModel: 'Vendor',
        isActive: true,
      },
      {
        $set: {
          isActive: false,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications deleted successfully',
      deletedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error('Delete all notifications error:', error);
    next(error);
  }
};

/**
 * Get unread notification count
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const vendorId = req.vendor._id;

    const unreadCount = await Notification.countDocuments({
      recipient: vendorId,
      recipientModel: 'Vendor',
      isActive: true,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    logger.error('Get unread count error:', error);
    next(error);
  }
};
