const logger = require('./logger');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const User = require('../models/User');

let io = null;
let socketIOAvailable = false;
const connectedRiders = new Map(); // Map<riderId, socketId>
const connectedUsers = new Map(); // Map<userId, socketId>

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
            'https://grocery.rushbaskets.com',
            'https://grocery.rushbaskets.com/',
            'https://admin.rushbaskets.com',
            'https://admin.rushbaskets.com/',
            'https://api.rushbaskets.com',
            'https://api.rushbaskets.com/',
            process.env.CORS_ORIGIN,
          ].filter(Boolean);
          
          // Normalize origin (remove trailing slash for comparison)
          const normalizedOrigin = origin ? origin.replace(/\/$/, '') : null;
          const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));
          
          if (!origin || normalizedAllowedOrigins.includes(normalizedOrigin)) {
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
        
        // Handle different roles
        if (decoded.role === 'rider') {
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
          socket.role = 'rider';
          console.log('✅ SOCKET AUTH: Rider authentication successful!');
          console.log('   - Rider ID:', socket.riderId);
          console.log('========================================');
          next();
        } else if (decoded.role === 'user') {
          // Verify user exists and is active
          console.log(`🔍 SOCKET AUTH: Looking up user with ID: ${decoded.id}`);
          const user = await User.findById(decoded.id);
          if (!user) {
            console.log(`❌ SOCKET AUTH: User not found with ID: ${decoded.id}`);
            return next(new Error('User not found'));
          }

          if (!user.isActive) {
            console.log('❌ SOCKET AUTH: User account is inactive');
            return next(new Error('User account is inactive'));
          }

          socket.userId = decoded.id;
          socket.user = user;
          socket.role = 'user';
          console.log('✅ SOCKET AUTH: User authentication successful!');
          console.log('   - User ID:', socket.userId);
          console.log('========================================');
          next();
        } else {
          console.log(`❌ SOCKET AUTH: Invalid role. Got '${decoded.role}'`);
          return next(new Error('Invalid role for socket connection'));
        }
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
      const role = socket.role;
      
      if (role === 'rider') {
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
      } else if (role === 'user') {
        const userId = socket.userId;
        logger.info(`User connected: ${userId} (Socket ID: ${socket.id})`);

        // Store user connection
        connectedUsers.set(userId.toString(), socket.id);

        // Join user to their personal room
        socket.join(`user:${userId}`);

        // Send connection confirmation
        socket.emit('connected', {
          success: true,
          message: 'Connected to user notification service',
          userId: userId,
        });

        // Handle disconnect
        socket.on('disconnect', () => {
          logger.info(`User disconnected: ${userId} (Socket ID: ${socket.id})`);
          connectedUsers.delete(userId.toString());
        });

        // Handle errors
        socket.on('error', (error) => {
          logger.error(`Socket error for user ${userId}:`, error);
        });
      }
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
      // Build vendor details string for notification message
      let vendorDetailsText = '';
      if (orderData.vendorAddresses && orderData.vendorAddresses.length > 0) {
        const vendor = orderData.vendorAddresses[0]; // Use first vendor
        const vendorName = vendor.vendorName || vendor.storeName || 'Vendor';
        const vendorPhone = vendor.contactNumber || '';
        const vendorAddress = vendor.storeAddress ? [
          vendor.storeAddress.line1,
          vendor.storeAddress.line2,
          vendor.storeAddress.city,
          vendor.storeAddress.state,
          vendor.storeAddress.pinCode
        ].filter(Boolean).join(', ') : '';
        
        vendorDetailsText = `\nVendor: ${vendorName}`;
        if (vendorPhone) {
          vendorDetailsText += `\nPhone: ${vendorPhone}`;
        }
        if (vendorAddress) {
          vendorDetailsText += `\nAddress: ${vendorAddress}`;
        }
      }

      // Rider earnings (delivery amount is what rider earns)
      const riderEarnings = orderData.deliveryAmount || 0;

      // Build properly formatted shipping address
      const formattedShippingAddress = orderData.shippingAddress ? {
        line1: orderData.shippingAddress.line1 || '',
        line2: orderData.shippingAddress.line2 || '',
        city: orderData.shippingAddress.city || '',
        state: orderData.shippingAddress.state || '',
        pinCode: orderData.shippingAddress.pinCode || '',
        phone: orderData.shippingAddress.phone || '',
        latitude: orderData.shippingAddress.latitude || null,
        longitude: orderData.shippingAddress.longitude || null,
      } : null;

      // Build complete location information with formatted address string
      const location = formattedShippingAddress ? {
        address: [
          formattedShippingAddress.line1,
          formattedShippingAddress.line2,
          formattedShippingAddress.city,
          formattedShippingAddress.state,
          formattedShippingAddress.pinCode
        ].filter(Boolean).join(', '),
        line1: formattedShippingAddress.line1,
        line2: formattedShippingAddress.line2,
        city: formattedShippingAddress.city,
        state: formattedShippingAddress.state,
        pinCode: formattedShippingAddress.pinCode,
        phone: formattedShippingAddress.phone,
        coordinates: {
          latitude: formattedShippingAddress.latitude,
          longitude: formattedShippingAddress.longitude,
        }
      } : null;

      const notificationPayload = {
        type: 'order_assignment_request',
        title: 'New Order Assignment Available',
        message: `Order ${orderData.orderNumber} is ready for delivery. Amount: ₹${orderData.pricing?.total || 0}, Delivery: ₹${orderData.deliveryAmount || 0}, Rider Earnings: ₹${riderEarnings}.${vendorDetailsText}\nWould you like to accept?`,
        data: {
          // Order Basic Info
          _id: orderData._id,
          orderId: orderData._id,
          orderNumber: orderData.orderNumber,
          status: orderData.status,
          createdAt: orderData.createdAt,
          
          // Order Items
          items: orderData.items || [],
          itemCount: orderData.items?.length || 0,
          
          // Pricing Details
          pricing: orderData.pricing || {},
          amount: orderData.pricing?.total || 0,
          subtotal: orderData.pricing?.subtotal || 0,
          discount: orderData.pricing?.discount || 0,
          tax: orderData.pricing?.tax || 0,
          handlingCharge: orderData.pricing?.handlingCharge || 0,
          totalCashback: orderData.pricing?.totalCashback || 0,
          
          // Delivery & Earnings
          deliveryAmount: orderData.deliveryAmount || 0,
          riderEarnings: riderEarnings,
          
          // Shipping Address & Location (Properly Formatted)
          shippingAddress: formattedShippingAddress,
          location: location,
          
          // User Details
          user: orderData.user || null,
          userName: orderData.user?.userName || null,
          userPhone: orderData.user?.contactNumber || null,
          userEmail: orderData.user?.email || null,
          
          // Vendor Details
          vendorAddresses: orderData.vendorAddresses || [],
          vendorCount: orderData.vendorAddresses?.length || 0,
          
          // Full Order Object (for backward compatibility)
          order: orderData,
        },
        timestamp: new Date().toISOString(),
      };

      ioInstance.to(`rider:${riderId}`).emit('order_assignment_request', notificationPayload);
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
    
    // Format shipping address properly
    const formattedShippingAddress = orderData.shippingAddress ? {
      line1: orderData.shippingAddress.line1 || '',
      line2: orderData.shippingAddress.line2 || '',
      city: orderData.shippingAddress.city || '',
      state: orderData.shippingAddress.state || '',
      pinCode: orderData.shippingAddress.pinCode || '',
      phone: orderData.shippingAddress.phone || '',
      latitude: orderData.shippingAddress.latitude || null,
      longitude: orderData.shippingAddress.longitude || null,
    } : null;

    // Build location information
    const location = formattedShippingAddress ? {
      address: [
        formattedShippingAddress.line1,
        formattedShippingAddress.line2,
        formattedShippingAddress.city,
        formattedShippingAddress.state,
        formattedShippingAddress.pinCode
      ].filter(Boolean).join(', '),
      line1: formattedShippingAddress.line1,
      line2: formattedShippingAddress.line2,
      city: formattedShippingAddress.city,
      state: formattedShippingAddress.state,
      pinCode: formattedShippingAddress.pinCode,
      phone: formattedShippingAddress.phone,
      coordinates: {
        latitude: formattedShippingAddress.latitude,
        longitude: formattedShippingAddress.longitude,
      }
    } : (orderData.location || null);

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
      // Location information (Properly Formatted)
      location: location,
      shippingAddress: formattedShippingAddress || {},
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
    total: connectedRiders.size + connectedUsers.size,
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
  notifyUserOrderUpdate,
  broadcastToAll,
  getConnectionCounts,
};
