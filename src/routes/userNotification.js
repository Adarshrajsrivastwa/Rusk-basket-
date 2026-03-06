const express = require('express');
const { body } = require('express-validator');
const {
  updateFCMToken,
  removeFCMToken,
  testNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/userNotification');
const { protect } = require('../middleware/userAuth');

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/', protect, getNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notifications count
 * @access  Private
 */
router.get('/unread-count', protect, getUnreadCount);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:id/read', protect, markAsRead);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/read-all', protect, markAllAsRead);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/:id', protect, deleteNotification);

/**
 * Update FCM token
 */
router.post(
  '/fcm-token',
  protect,
  [
    body('token')
      .notEmpty()
      .withMessage('FCM token is required')
      .trim(),
    body('deviceId')
      .optional()
      .trim(),
    body('platform')
      .optional()
      .isIn(['android', 'ios', 'web'])
      .withMessage('Platform must be android, ios, or web'),
  ],
  updateFCMToken
);

/**
 * Remove FCM token
 */
router.post(
  '/fcm-token/remove',
  protect,
  [
    body('token')
      .notEmpty()
      .withMessage('FCM token is required')
      .trim(),
  ],
  removeFCMToken
);

/**
 * Test push notification
 */
router.post('/test', protect, testNotification);

module.exports = router;

