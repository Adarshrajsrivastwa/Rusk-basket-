const admin = require('firebase-admin');
const logger = require('./logger');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Check if Firebase credentials are provided
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      logger.warn('Firebase service account not configured. Push notifications will be disabled.');
      return;
    }

    // Parse service account from environment variable (JSON string)
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (parseError) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT. It should be a valid JSON string.');
      return;
    }

    // Initialize Firebase Admin
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      logger.info('Firebase Admin SDK initialized successfully');
    }
  } catch (error) {
    logger.error('Firebase initialization error:', error);
    firebaseInitialized = false;
  }
};

// Initialize on module load
initializeFirebase();

/**
 * Send push notification to user
 */
const sendPushNotification = async (userId, notificationData) => {
  try {
    if (!firebaseInitialized) {
      logger.warn('Firebase not initialized. Skipping push notification.');
      return { success: false, error: 'Firebase not initialized' };
    }

    // Get user with FCM tokens
    const user = await User.findById(userId).select('fcmToken fcmTokens isActive');
    
    if (!user) {
      logger.warn(`User ${userId} not found for push notification`);
      return { success: false, error: 'User not found' };
    }

    if (!user.isActive) {
      logger.info(`User ${userId} is not active. Skipping push notification`);
      return { success: false, error: 'User is not active' };
    }

    // Collect all FCM tokens
    const tokens = [];
    
    // Add single fcmToken if exists (for backward compatibility)
    if (user.fcmToken) {
      tokens.push(user.fcmToken);
    }
    
    // Add tokens from fcmTokens array
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      user.fcmTokens.forEach(tokenObj => {
        if (tokenObj.token && !tokens.includes(tokenObj.token)) {
          tokens.push(tokenObj.token);
        }
      });
    }

    if (tokens.length === 0) {
      logger.info(`No FCM tokens found for user ${userId}`);
      return { success: false, error: 'No FCM tokens found' };
    }

    // Prepare notification payload
    const message = {
      notification: {
        title: notificationData.title || 'Rush Baskets',
        body: notificationData.message || notificationData.body || '',
      },
      data: {
        type: notificationData.type || 'general',
        orderId: notificationData.orderId || '',
        orderNumber: notificationData.orderNumber || '',
        status: notificationData.status || '',
        ...notificationData.data,
      },
      tokens: tokens,
    };

    // Add Android-specific config
    message.android = {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'order_updates',
        priority: 'high',
      },
    };

    // Add iOS-specific config
    message.apns = {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          priority: 10,
        },
      },
    };

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(message);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          invalidTokens.push(tokens[idx]);
          logger.warn(`Failed to send notification to token ${tokens[idx]}: ${resp.error?.message}`);
        }
      });

      // Remove invalid tokens from user
      if (invalidTokens.length > 0) {
        await removeInvalidTokens(userId, invalidTokens);
      }
    }

    logger.info(`Push notification sent to user ${userId}. Success: ${response.successCount}, Failed: ${response.failureCount}`);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    logger.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Remove invalid FCM tokens from user
 */
const removeInvalidTokens = async (userId, invalidTokens) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Remove from fcmToken if it's invalid
    if (user.fcmToken && invalidTokens.includes(user.fcmToken)) {
      user.fcmToken = undefined;
    }

    // Remove from fcmTokens array
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      user.fcmTokens = user.fcmTokens.filter(
        tokenObj => !invalidTokens.includes(tokenObj.token)
      );
    }

    await user.save();
    logger.info(`Removed ${invalidTokens.length} invalid FCM tokens for user ${userId}`);
  } catch (error) {
    logger.error('Error removing invalid tokens:', error);
  }
};

/**
 * Send order status update notification
 */
const sendOrderStatusNotification = async (userId, orderData) => {
  const statusMessages = {
    pending: {
      title: 'Order Placed',
      message: `Your order ${orderData.orderNumber} has been placed successfully`,
    },
    confirmed: {
      title: 'Order Confirmed',
      message: `Your order ${orderData.orderNumber} has been confirmed`,
    },
    processing: {
      title: 'Order Processing',
      message: `Your order ${orderData.orderNumber} is being processed`,
    },
    ready: {
      title: 'Order Ready',
      message: `Your order ${orderData.orderNumber} is ready for pickup`,
    },
    out_for_delivery: {
      title: 'Out for Delivery',
      message: `Your order ${orderData.orderNumber} is out for delivery`,
    },
    delivered: {
      title: 'Order Delivered',
      message: `Your order ${orderData.orderNumber} has been delivered successfully`,
    },
    cancelled: {
      title: 'Order Cancelled',
      message: `Your order ${orderData.orderNumber} has been cancelled`,
    },
    refunded: {
      title: 'Order Refunded',
      message: `Your order ${orderData.orderNumber} has been refunded`,
    },
  };

  const statusMessage = statusMessages[orderData.status] || {
    title: 'Order Update',
    message: `Your order ${orderData.orderNumber} status has been updated`,
  };

  return await sendPushNotification(userId, {
    title: statusMessage.title,
    message: statusMessage.message,
    type: 'order_status_update',
    orderId: orderData.orderId || orderData._id?.toString(),
    orderNumber: orderData.orderNumber,
    status: orderData.status,
    data: {
      orderId: orderData.orderId || orderData._id?.toString(),
      orderNumber: orderData.orderNumber,
      status: orderData.status,
    },
  });
};

/**
 * Send push notification to vendor
 */
const sendVendorPushNotification = async (vendorId, notificationData) => {
  try {
    if (!firebaseInitialized) {
      logger.warn('Firebase not initialized. Skipping push notification.');
      return { success: false, error: 'Firebase not initialized' };
    }

    // Get vendor with FCM tokens
    const vendor = await Vendor.findById(vendorId).select('fcmToken fcmTokens isActive');
    
    if (!vendor) {
      logger.warn(`Vendor ${vendorId} not found for push notification`);
      return { success: false, error: 'Vendor not found' };
    }

    if (!vendor.isActive) {
      logger.info(`Vendor ${vendorId} is not active. Skipping push notification`);
      return { success: false, error: 'Vendor is not active' };
    }

    // Collect all FCM tokens
    const tokens = [];
    
    if (vendor.fcmToken) {
      tokens.push(vendor.fcmToken);
    }
    
    if (vendor.fcmTokens && vendor.fcmTokens.length > 0) {
      vendor.fcmTokens.forEach(tokenObj => {
        if (tokenObj.token && !tokens.includes(tokenObj.token)) {
          tokens.push(tokenObj.token);
        }
      });
    }

    if (tokens.length === 0) {
      logger.info(`No FCM tokens found for vendor ${vendorId}`);
      return { success: false, error: 'No FCM tokens found' };
    }

    // Prepare notification payload
    const message = {
      notification: {
        title: notificationData.title || 'Rush Baskets',
        body: notificationData.message || notificationData.body || '',
      },
      data: {
        type: notificationData.type || 'general',
        orderId: notificationData.orderId || '',
        orderNumber: notificationData.orderNumber || '',
        status: notificationData.status || '',
        ...notificationData.data,
      },
      tokens: tokens,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'vendor_notifications',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            priority: 10,
          },
        },
      },
    };

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(message);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await removeInvalidVendorTokens(vendorId, invalidTokens);
      }
    }

    logger.info(`Push notification sent to vendor ${vendorId}. Success: ${response.successCount}, Failed: ${response.failureCount}`);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    logger.error('Error sending push notification to vendor:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to admin
 */
const sendAdminPushNotification = async (adminId, notificationData) => {
  try {
    if (!firebaseInitialized) {
      logger.warn('Firebase not initialized. Skipping push notification.');
      return { success: false, error: 'Firebase not initialized' };
    }

    // Get admin with FCM tokens
    const adminUser = await Admin.findById(adminId).select('fcmToken fcmTokens isActive');
    
    if (!adminUser) {
      logger.warn(`Admin ${adminId} not found for push notification`);
      return { success: false, error: 'Admin not found' };
    }

    if (!adminUser.isActive) {
      logger.info(`Admin ${adminId} is not active. Skipping push notification`);
      return { success: false, error: 'Admin is not active' };
    }

    // Collect all FCM tokens
    const tokens = [];
    
    if (adminUser.fcmToken) {
      tokens.push(adminUser.fcmToken);
    }
    
    if (adminUser.fcmTokens && adminUser.fcmTokens.length > 0) {
      adminUser.fcmTokens.forEach(tokenObj => {
        if (tokenObj.token && !tokens.includes(tokenObj.token)) {
          tokens.push(tokenObj.token);
        }
      });
    }

    if (tokens.length === 0) {
      logger.info(`No FCM tokens found for admin ${adminId}`);
      return { success: false, error: 'No FCM tokens found' };
    }

    // Prepare notification payload
    const message = {
      notification: {
        title: notificationData.title || 'Rush Baskets Admin',
        body: notificationData.message || notificationData.body || '',
      },
      data: {
        type: notificationData.type || 'general',
        ticketId: notificationData.ticketId || '',
        orderId: notificationData.orderId || '',
        orderNumber: notificationData.orderNumber || '',
        ...notificationData.data,
      },
      tokens: tokens,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'admin_notifications',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            priority: 10,
          },
        },
      },
    };

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(message);

    // Handle invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await removeInvalidAdminTokens(adminId, invalidTokens);
      }
    }

    logger.info(`Push notification sent to admin ${adminId}. Success: ${response.successCount}, Failed: ${response.failureCount}`);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    logger.error('Error sending push notification to admin:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Remove invalid FCM tokens from vendor
 */
const removeInvalidVendorTokens = async (vendorId, invalidTokens) => {
  try {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return;

    if (vendor.fcmToken && invalidTokens.includes(vendor.fcmToken)) {
      vendor.fcmToken = undefined;
    }

    if (vendor.fcmTokens && vendor.fcmTokens.length > 0) {
      vendor.fcmTokens = vendor.fcmTokens.filter(
        tokenObj => !invalidTokens.includes(tokenObj.token)
      );
    }

    await vendor.save();
    logger.info(`Removed ${invalidTokens.length} invalid FCM tokens for vendor ${vendorId}`);
  } catch (error) {
    logger.error('Error removing invalid vendor tokens:', error);
  }
};

/**
 * Remove invalid FCM tokens from admin
 */
const removeInvalidAdminTokens = async (adminId, invalidTokens) => {
  try {
    const adminUser = await Admin.findById(adminId);
    if (!adminUser) return;

    if (adminUser.fcmToken && invalidTokens.includes(adminUser.fcmToken)) {
      adminUser.fcmToken = undefined;
    }

    if (adminUser.fcmTokens && adminUser.fcmTokens.length > 0) {
      adminUser.fcmTokens = adminUser.fcmTokens.filter(
        tokenObj => !invalidTokens.includes(tokenObj.token)
      );
    }

    await adminUser.save();
    logger.info(`Removed ${invalidTokens.length} invalid FCM tokens for admin ${adminId}`);
  } catch (error) {
    logger.error('Error removing invalid admin tokens:', error);
  }
};

module.exports = {
  sendPushNotification,
  sendOrderStatusNotification,
  sendVendorPushNotification,
  sendAdminPushNotification,
  removeInvalidTokens,
  removeInvalidVendorTokens,
  removeInvalidAdminTokens,
  initializeFirebase,
};
