const { notificationQueue } = require('../utils/queue');
const User = require('../models/User');
const logger = require('../utils/logger');

if (notificationQueue) {
  notificationQueue.process(async (job) => {
    const { userId, type, title, message, data } = job.data;
    
    try {
      // Check if user is active before sending notification
      // For order notifications, only send to active users
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
        // Continue even if push notification fails
      }
      
      // TODO: Implement in-app notification storage if needed
      // await createNotification({ userId, type, title, message, data });
      
      return { success: true, userId, type };
    } catch (error) {
      logger.error(`Error processing notification for user ${userId}:`, error);
      throw error;
    }
  });
}

module.exports = notificationQueue;

