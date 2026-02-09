const express = require('express');
const { body } = require('express-validator');
const {
  updateFCMToken,
  removeFCMToken,
  testNotification,
} = require('../controllers/userNotification');
const { protect } = require('../middleware/userAuth');

const router = express.Router();

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
