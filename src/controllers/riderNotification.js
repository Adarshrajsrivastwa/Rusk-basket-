const Rider = require('../models/Rider');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { sendRiderPushNotification } = require('../utils/firebaseNotification');

/**
 * Update FCM token for rider
 */
exports.updateRiderFCMToken = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const riderId = req.rider._id;
        const { token, deviceId, platform } = req.body;

        const rider = await Rider.findById(riderId);

        if (!rider) {
            return res.status(404).json({
                success: false,
                error: 'Rider not found',
            });
        }

        // Update single fcmToken (for backward compatibility)
        if (token) {
            rider.fcmToken = token;
        }

        // Add to fcmTokens array if not already present
        if (token && rider.fcmTokens) {
            const existingTokenIndex = rider.fcmTokens.findIndex(
                t => t.token === token
            );

            if (existingTokenIndex === -1) {
                // Add new token
                rider.fcmTokens.push({
                    token: token,
                    deviceId: deviceId || '',
                    platform: platform || 'android',
                });
            } else {
                // Update existing token
                rider.fcmTokens[existingTokenIndex].deviceId = deviceId || rider.fcmTokens[existingTokenIndex].deviceId;
                rider.fcmTokens[existingTokenIndex].platform = platform || rider.fcmTokens[existingTokenIndex].platform;
                rider.fcmTokens[existingTokenIndex].createdAt = new Date();
            }
        } else if (token) {
            // Initialize fcmTokens array if it doesn't exist
            rider.fcmTokens = [{
                token: token,
                deviceId: deviceId || '',
                platform: platform || 'android',
            }];
        }

        await rider.save();

        logger.info(`FCM token updated for rider ${riderId}`);

        res.status(200).json({
            success: true,
            message: 'FCM token updated successfully',
        });
    } catch (error) {
        logger.error('Update Rider FCM token error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to update FCM token',
        });
    }
};

/**
 * Remove FCM token for rider
 */
exports.removeRiderFCMToken = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const riderId = req.rider._id;
        const { token } = req.body;

        const rider = await Rider.findById(riderId);

        if (!rider) {
            return res.status(404).json({
                success: false,
                error: 'Rider not found',
            });
        }

        // Remove from fcmToken if it matches
        if (rider.fcmToken === token) {
            rider.fcmToken = undefined;
        }

        // Remove from fcmTokens array
        if (rider.fcmTokens && rider.fcmTokens.length > 0) {
            rider.fcmTokens = rider.fcmTokens.filter(t => t.token !== token);
        }

        await rider.save();

        logger.info(`FCM token removed for rider ${riderId}`);

        res.status(200).json({
            success: true,
            message: 'FCM token removed successfully',
        });
    } catch (error) {
        logger.error('Remove Rider FCM token error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to remove FCM token',
        });
    }
};

/**
 * Get rider notifications
 */
exports.getRiderNotifications = async (req, res, next) => {
    try {
        const riderId = req.rider._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const query = {
            recipient: riderId,
            recipientModel: 'Rider',
            isActive: true,
        };

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
        logger.error('Get rider notifications error:', error);
        next(error);
    }
};

/**
 * Get rider unread notifications count
 */
exports.getRiderUnreadCount = async (req, res, next) => {
    try {
        const riderId = req.rider._id;

        const count = await Notification.countDocuments({
            recipient: riderId,
            recipientModel: 'Rider',
            isRead: false,
            isActive: true,
        });

        res.status(200).json({
            success: true,
            count,
        });
    } catch (error) {
        logger.error('Get rider unread count error:', error);
        next(error);
    }
};

/**
 * Mark rider notification as read
 */
exports.markRiderAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;
        const riderId = req.rider._id;

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: riderId, recipientModel: 'Rider' },
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
        logger.error('Mark rider notification as read error:', error);
        next(error);
    }
};

/**
 * Mark all rider notifications as read
 */
exports.markAllRiderAsRead = async (req, res, next) => {
    try {
        const riderId = req.rider._id;

        await Notification.updateMany(
            { recipient: riderId, recipientModel: 'Rider', isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
        });
    } catch (error) {
        logger.error('Mark all rider notifications as read error:', error);
        next(error);
    }
};

/**
 * Delete a rider notification
 */
exports.deleteRiderNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const riderId = req.rider._id;

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: riderId, recipientModel: 'Rider' },
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
        logger.error('Delete rider notification error:', error);
        next(error);
    }
};

/**
 * Test push notification for rider (for testing)
 */
exports.testRiderNotification = async (req, res, next) => {
    try {
        const riderId = req.rider._id;

        const result = await sendRiderPushNotification(riderId, {
            title: 'Test Notification',
            message: 'This is a test push notification for Riders from Rush Baskets',
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
        logger.error('Test rider notification error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to send test notification',
        });
    }
};

