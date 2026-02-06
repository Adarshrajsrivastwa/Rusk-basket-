const logger = require('./logger');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const User = require('../models/User');

let io = null;
let socketIOAvailable = false;
const connectedRiders = new Map(); // Map<riderId, socketId>

// Try to load socket.io, but make it optional
try {
  require('socket.io');
  socketIOAvailable = true;
  logger.info('Socket.io module loaded successfully');
} catch (error) {
  logger.warn('Socket.io is not installed. WebSocket functionality will be disabled. Install with: npm install socket.io');
  socketIOAvailable = false;
}

/**
 * Initialize Socket.io server
 */
const initializeSocket = (server) => {
  if (!socketIOAvailable) {
    logger.warn('Socket.io is not available. WebSocket functionality will be disabled.');
    return null;
  }
  
  try {
    const { Server } = require('socket.io');
    io = new Server(server, {
      cors: {
        origin: function (origin, callback) {
          const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://46.202.164.93',
            process.env.CORS_ORIGIN,
          ].filter(Boolean);
          
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(null, true);
          }
        },
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware for Socket.io
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          console.log('❌ SOCKET AUTH: Token not found in handshake');
          return next(new Error('Authentication token required'));
        }

        console.log('🔑 SOCKET AUTH: Token received, verifying...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        console.log('✅ SOCKET AUTH: Token decoded successfully');
        console.log('   - Decoded ID:', decoded.id);
        console.log('   - Decoded Role:', decoded.role);
        console.log('   - Token Expires:', decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'N/A');
        
        if (decoded.role !== 'rider') {
          console.log(`❌ SOCKET AUTH: Invalid role. Expected 'rider', got '${decoded.role}'`);
          return next(new Error('Only riders can connect to this socket'));
        }
        
        console.log('✅ SOCKET AUTH: Role verified as rider');

        // Verify rider exists and is active
        console.log(`🔍 SOCKET AUTH: Looking up rider with ID: ${decoded.id}`);
        const rider = await Rider.findById(decoded.id);
        if (!rider) {
          console.log(`❌ SOCKET AUTH: Rider not found with ID: ${decoded.id}`);
          return next(new Error('Rider not found'));
        }

        console.log('✅ SOCKET AUTH: Rider found');
        console.log('   - Rider Name:', rider.fullName || 'N/A');
        console.log('   - Mobile:', rider.mobileNumber || 'N/A');
        console.log('   - Is Active:', rider.isActive);
        console.log('   - Approval Status:', rider.approvalStatus);

        if (!rider.isActive) {
          console.log('❌ SOCKET AUTH: Rider account is inactive');
          return next(new Error('Rider account is inactive'));
        }

        if (rider.approvalStatus !== 'approved') {
          console.log(`❌ SOCKET AUTH: Rider not approved. Status: ${rider.approvalStatus}`);
          return next(new Error('Rider account is not approved'));
        }

        socket.riderId = decoded.id;
        socket.rider = rider;
        console.log('✅ SOCKET AUTH: Authentication successful!');
        console.log('   - Rider ID:', socket.riderId);
        console.log('========================================');
        next();
      } catch (error) {
        console.log('❌ SOCKET AUTH ERROR:', error.message);
        console.log('   - Error Type:', error.name);
        if (error.name === 'JsonWebTokenError') {
          console.log('   - Issue: Invalid token format or signature');
        } else if (error.name === 'TokenExpiredError') {
          console.log('   - Issue: Token has expired');
        } else if (error.name === 'JsonWebTokenError') {
          console.log('   - Issue: Token verification failed');
        }
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      const riderId = socket.riderId;
      logger.info(`Rider connected: ${riderId} (Socket ID: ${socket.id})`);

      // Store rider connection
      connectedRiders.set(riderId.toString(), socket.id);

      // Join rider to their personal room
      socket.join(`rider:${riderId}`);

      // Send connection confirmation
      socket.emit('connected', {
        success: true,
        message: 'Connected to order assignment service',
        riderId: riderId,
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Rider disconnected: ${riderId} (Socket ID: ${socket.id})`);
        connectedRiders.delete(riderId.toString());
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error for rider ${riderId}:`, error);
      });
    });

    logger.info('Socket.io server initialized');
    return io;
  } catch (error) {
    logger.error('Error initializing Socket.io:', error);
    socketIOAvailable = false;
    return null;
  }
};

/**
 * Get Socket.io instance
 */
const getIO = () => {
  if (!socketIOAvailable || !io) {
    throw new Error('Socket.io not available or not initialized');
  }
  return io;
};

/**
 * Send order assignment request to a specific rider
 */
const sendOrderAssignmentRequest = async (riderId, orderData) => {
  const riderIdStr = riderId.toString();

  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for rider ${riderId}`);
    return false;
  }
  
  try {
    const ioInstance = getIO();
    const socketId = connectedRiders.get(riderIdStr);

    if (socketId) {
      const notificationPayload = {
        type: 'order_assignment_request',
        title: 'New Order Assignment Available',
        message: `Order ${orderData.orderNumber} is ready for delivery. Amount: ₹${orderData.amount || orderData.pricing?.total || 0}. Would you like to accept?`,
        data: {
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
          order: orderData,
          // Amount information
          amount: orderData.amount || orderData.pricing?.total || 0,
          deliveryAmount: orderData.deliveryAmount || orderData.pricing?.deliveryAmount || 0,
          pricing: orderData.pricing,
          // Location information
          location: orderData.location,
          shippingAddress: orderData.shippingAddress,
          // User information
          user: orderData.user || null,
          // Full order data
          order: orderData,
        },
        timestamp: new Date().toISOString(),
      };

      ioInstance.to(`rider:${riderId}`).emit('order_assignment_request', notificationPayload);

      // Console log: Notification sent
      const userInfo = orderData.user ? orderData.user.userName : 'N/A';
      console.log(`📤 Notification: Order ${orderData.orderNumber} to Rider ${riderId} | User: ${userInfo}`);
      logger.info(`Order assignment request sent to rider ${riderId} via WebSocket`);
      return true;
    } else {
      logger.warn(`Rider ${riderId} is not connected. Order assignment request will not be delivered.`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending order assignment request to rider ${riderId}:`, error);
    return false;
  }
};

/**
 * Send order assignment request to multiple riders
 */
const sendOrderAssignmentRequestToRiders = async (riderIds, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notifications for ${riderIds.length} riders`);
    return 0;
  }
  
  const results = await Promise.all(
    riderIds.map(riderId => sendOrderAssignmentRequest(riderId, orderData))
  );
  
  const successCount = results.filter(Boolean).length;
  return successCount;
};

/**
 * Notify rider about order status update
 */
const notifyRiderOrderUpdate = (riderId, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for rider ${riderId}`);
    return;
  }
  
  try {
    const ioInstance = getIO();
    
    // Prepare update payload with amount and location
    const updatePayload = {
      type: 'order_update',
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      // Amount information
      amount: orderData.amount || orderData.pricing?.total || 0,
      deliveryAmount: orderData.deliveryAmount || orderData.pricing?.deliveryAmount || 0,
      pricing: orderData.pricing || {},
      // Location information
      location: orderData.location || (orderData.shippingAddress ? {
        address: [
          orderData.shippingAddress?.line1,
          orderData.shippingAddress?.line2,
          orderData.shippingAddress?.city,
          orderData.shippingAddress?.state,
          orderData.shippingAddress?.pinCode
        ].filter(Boolean).join(', '),
        city: orderData.shippingAddress?.city || '',
        state: orderData.shippingAddress?.state || '',
        pinCode: orderData.shippingAddress?.pinCode || '',
        coordinates: {
          latitude: orderData.shippingAddress?.latitude || null,
          longitude: orderData.shippingAddress?.longitude || null,
        }
      } : null),
      shippingAddress: orderData.shippingAddress || {},
      // Full order data
      data: orderData,
      timestamp: new Date().toISOString(),
    };
    
    ioInstance.to(`rider:${riderId}`).emit('order_update', updatePayload);
    
    logger.info(`Order update sent to rider ${riderId} via WebSocket`);
  } catch (error) {
    logger.error(`Error sending order update to rider ${riderId}:`, error);
  }
};

/**
 * Get connected riders count
 */
const getConnectedRidersCount = () => {
  return connectedRiders.size;
};

/**
 * Check if a rider is connected
 */
const isRiderConnected = (riderId) => {
  if (!socketIOAvailable || !io) {
    return false;
  }
  return connectedRiders.has(riderId.toString());
};

/**
 * Send notification to a user (only if user is active)
 */
const sendUserNotification = async (userId, notificationData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for user ${userId}`);
    return false;
  }
  
  try {
    // Check if user is active before sending notification
    if (userId) {
      const user = await User.findById(userId).select('isActive');
      
      if (!user) {
        logger.warn(`User ${userId} not found. Skipping notification.`);
        return false;
      }
      
      if (!user.isActive) {
        logger.info(`User ${userId} is not active. Skipping notification.`);
        return false;
      }
    }
    
    const ioInstance = getIO();
    const socketId = connectedUsers.get(userId.toString());

    if (socketId) {
      ioInstance.to(`user:${userId}`).emit('notification', {
        type: 'notification',
        ...notificationData,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Notification sent to user ${userId} via WebSocket`);
      return true;
    } else {
      logger.warn(`User ${userId} is not connected. Notification will not be delivered.`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending notification to user ${userId}:`, error);
    return false;
  }
};

/**
 * Send notification to a vendor
 */
const sendVendorNotification = (vendorId, notificationData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for vendor ${vendorId}`);
    return false;
  }
  
  try {
    const ioInstance = getIO();
    const socketId = connectedVendors.get(vendorId.toString());

    if (socketId) {
      ioInstance.to(`vendor:${vendorId}`).emit('notification', {
        type: 'notification',
        ...notificationData,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Notification sent to vendor ${vendorId} via WebSocket`);
      return true;
    } else {
      logger.warn(`Vendor ${vendorId} is not connected. Notification will not be delivered.`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending notification to vendor ${vendorId}:`, error);
    return false;
  }
};

/**
 * Send notification to an admin
 */
const sendAdminNotification = (adminId, notificationData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for admin ${adminId}`);
    return false;
  }
  
  try {
    const ioInstance = getIO();
    const socketId = connectedAdmins.get(adminId.toString());

    if (socketId) {
      ioInstance.to(`admin:${adminId}`).emit('notification', {
        type: 'notification',
        ...notificationData,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Notification sent to admin ${adminId} via WebSocket`);
      return true;
    } else {
      logger.warn(`Admin ${adminId} is not connected. Notification will not be delivered.`);
      return false;
    }
  } catch (error) {
    logger.error(`Error sending notification to admin ${adminId}:`, error);
    return false;
  }
};

/**
 * Send order update to user
 */
const notifyUserOrderUpdate = (userId, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for user ${userId}`);
    return;
  }
  
  try {
    const ioInstance = getIO();
    
    const updatePayload = {
      type: 'order_update',
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      data: orderData,
      timestamp: new Date().toISOString(),
    };
    
    ioInstance.to(`user:${userId}`).emit('order_update', updatePayload);
    logger.info(`Order update sent to user ${userId} via WebSocket`);
  } catch (error) {
    logger.error(`Error sending order update to user ${userId}:`, error);
  }
};

/**
 * Send order update to vendor
 */
const notifyVendorOrderUpdate = (vendorId, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for vendor ${vendorId}`);
    return;
  }
  
  try {
    const ioInstance = getIO();
    
    const updatePayload = {
      type: 'order_update',
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      data: orderData,
      timestamp: new Date().toISOString(),
    };
    
    ioInstance.to(`vendor:${vendorId}`).emit('order_update', updatePayload);
    logger.info(`Order update sent to vendor ${vendorId} via WebSocket`);
  } catch (error) {
    logger.error(`Error sending order update to vendor ${vendorId}:`, error);
  }
};

/**
 * Broadcast to all connected users
 */
const broadcastToAll = (eventName, data) => {
  if (!socketIOAvailable || !io) {
    logger.debug('Socket.io not available. Skipping broadcast.');
    return;
  }
  
  try {
    const ioInstance = getIO();
    ioInstance.emit(eventName, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    logger.info(`Broadcast sent to all users: ${eventName}`);
  } catch (error) {
    logger.error(`Error broadcasting to all users:`, error);
  }
};

/**
 * Get connection counts
 */
const getConnectionCounts = () => {
  return {
    riders: connectedRiders.size,
    users: connectedUsers.size,
    vendors: connectedVendors.size,
    admins: connectedAdmins.size,
    total: connectedRiders.size + connectedUsers.size + connectedVendors.size + connectedAdmins.size,
  };
};

module.exports = {
  initializeSocket,
  getIO,
  sendOrderAssignmentRequest,
  sendOrderAssignmentRequestToRiders,
  notifyRiderOrderUpdate,
  getConnectedRidersCount,
  isRiderConnected,
  sendUserNotification,
  sendVendorNotification,
  sendAdminNotification,
  notifyUserOrderUpdate,
  notifyVendorOrderUpdate,
  broadcastToAll,
  getConnectionCounts,
};
