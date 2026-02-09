const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { sendVendorPushNotification } = require('../utils/firebaseNotification');

/**
 * Get vendor notifications
 */
exports.getVendorNotifications = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

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
      .populate({
        path: 'order',
        select: 'orderNumber status',
        strictPopulate: false,
      })
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
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message || 'An error occurred while fetching notifications',
    });
  }
};

/**
 * Mark notification as read
 */
exports.markNotificationAsRead = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { notificationId } = req.params;

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
    return res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllNotificationsAsRead = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

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
    return res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Delete notification
 */
exports.deleteNotification = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { notificationId } = req.params;

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
    return res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Delete all notifications
 */
exports.deleteAllNotifications = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

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
    return res.status(500).json({
      success: false,
      error: 'Failed to delete all notifications',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Get unread notification count
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    // Check if vendor is authenticated
    if (!req.vendor || !req.vendor._id) {
      return res.status(401).json({
        success: false,
        error: 'Vendor authentication required',
      });
    }

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
    return res.status(500).json({
      success: false,
      error: 'Failed to get unread count',
      message: error.message || 'An error occurred',
      unreadCount: 0,
    });
  }
};

/**
 * Get admin notifications
 */
exports.getAdminNotifications = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const adminId = req.admin._id;
    const { page = 1, limit = 20, isRead, type } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = {
      recipient: adminId,
      recipientModel: 'Admin',
      isActive: true,
    };

    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .populate({
        path: 'order',
        select: 'orderNumber status',
        strictPopulate: false,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: adminId,
      recipientModel: 'Admin',
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
    logger.error('Get admin notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message || 'An error occurred while fetching notifications',
    });
  }
};

/**
 * Mark admin notification as read
 */
exports.markAdminNotificationAsRead = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const adminId = req.admin._id;
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: adminId,
      recipientModel: 'Admin',
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
    logger.error('Mark admin notification as read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Mark all admin notifications as read
 */
exports.markAllAdminNotificationsAsRead = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
    }

    const adminId = req.admin._id;

    const result = await Notification.updateMany(
      {
        recipient: adminId,
        recipientModel: 'Admin',
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
    logger.error('Mark all admin notifications as read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Delete admin notification
 */
exports.deleteAdminNotification = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const adminId = req.admin._id;
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: adminId,
      recipientModel: 'Admin',
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
    logger.error('Delete admin notification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Delete all admin notifications
 */
exports.deleteAllAdminNotifications = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
    }

    const adminId = req.admin._id;

    const result = await Notification.updateMany(
      {
        recipient: adminId,
        recipientModel: 'Admin',
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
    logger.error('Delete all admin notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete all notifications',
      message: error.message || 'An error occurred',
    });
  }
};

/**
 * Get admin unread notification count
 */
exports.getAdminUnreadCount = async (req, res, next) => {
  try {
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
        unreadCount: 0,
      });
    }

    const adminId = req.admin._id;

    const unreadCount = await Notification.countDocuments({
      recipient: adminId,
      recipientModel: 'Admin',
      isActive: true,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    logger.error('Get admin unread count error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get unread count',
      message: error.message || 'An error occurred',
      unreadCount: 0,
    });
  }
};

/**
 * Helper function to create vendor notification with Firebase push notification
 * This function creates a notification in the database and automatically sends a push notification
 * @param {Object} notificationData - Notification data
 * @param {String} notificationData.vendorId - Vendor ID
 * @param {String} notificationData.type - Notification type
 * @param {String} notificationData.title - Notification title
 * @param {String} notificationData.message - Notification message
 * @param {Object} notificationData.data - Additional data
 * @param {String} notificationData.orderId - Order ID (optional)
 * @returns {Promise<Object>} Created notification
 */
exports.createVendorNotificationWithPush = async (notificationData) => {
  try {
    const { vendorId, type, title, message, data = {}, orderId = null } = notificationData;

    if (!vendorId || !type || !title || !message) {
      throw new Error('Missing required fields: vendorId, type, title, message');
    }

    // Create notification in database
    const notification = await Notification.create({
      recipient: vendorId,
      recipientModel: 'Vendor',
      type: type,
      title: title,
      message: message,
      data: data,
      order: orderId,
      isRead: false,
    });

    // Send Firebase push notification
    try {
      await sendVendorPushNotification(vendorId, {
        type: type,
        title: title,
        message: message,
        orderId: orderId ? orderId.toString() : '',
        orderNumber: data.orderNumber || '',
        status: data.status || '',
        data: {
          notificationId: notification._id.toString(),
          ...data,
        },
      });
      logger.info(`Push notification sent to vendor ${vendorId} for notification ${notification._id}`);
    } catch (pushError) {
      // Log error but don't fail notification creation
      logger.error(`Failed to send push notification to vendor ${vendorId}:`, pushError);
    }

    return notification;
  } catch (error) {
    logger.error('Error creating vendor notification with push:', error);
    throw error;
  }
};