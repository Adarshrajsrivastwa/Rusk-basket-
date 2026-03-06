const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Initialize the notification worker
 * This should be called after initializeQueues()
 */
const initializeNotificationWorker = () => {
  // Re-require to get the initialized queue
  const { notificationQueue } = require('../utils/queue');

  if (notificationQueue) {
    notificationQueue.process(async (job) => {
      const { userId, type, title, message, data } = job.data;

      try {
        // Check if user is active before sending notification
        if (userId) {
          const user = await User.findById(userId).select('isActive');

          if (!user) {
            logger.warn(`User ${userId} not found. Skipping notification.`);
            return { success: false, userId, type, reason: 'User not found' };
          }

          if (!user.isActive) {
            logger.info(`User ${userId} is not active. Skipping notification for type: ${type}`);
            return { success: false, userId, type, reason: 'User is not active' };
          }
        }

        // Send push notification via Firebase
        try {
          const { sendPushNotification } = require('../utils/firebaseNotification');
          const pushResult = await sendPushNotification(userId, {
            title: title,
            message: message,
            type: type,
            ...data,
          });

          if (pushResult.success) {
            logger.info(`Push notification sent to user ${userId} for type: ${type}`);
          } else {
            logger.warn(`Failed to send push notification to user ${userId}: ${pushResult.error}`);
          }
        } catch (pushError) {
          logger.error(`Error sending push notification to user ${userId}:`, pushError);
        }

        return { success: true, userId, type };
      } catch (error) {
        logger.error(`Error processing notification for user ${userId}:`, error);
        throw error;
      }
    });
    logger.info('Notification worker started processing');
  } else {
    logger.warn('Notification queue not available for worker');
  }
};

module.exports = { initializeNotificationWorker };

