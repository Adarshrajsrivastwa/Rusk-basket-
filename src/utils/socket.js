const logger = require('./logger');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');

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
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.role !== 'rider') {
          return next(new Error('Only riders can connect to this socket'));
        }

        // Verify rider exists and is active
        const rider = await Rider.findById(decoded.id);
        if (!rider) {
          return next(new Error('Rider not found'));
        }

        if (!rider.isActive) {
          return next(new Error('Rider account is inactive'));
        }

        if (rider.approvalStatus !== 'approved') {
          return next(new Error('Rider account is not approved'));
        }

        socket.riderId = decoded.id;
        socket.rider = rider;
        next();
      } catch (error) {
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
          deliveryAmount: orderData.deliveryAmount || orderData.pricing?.deliveryAmount || orderData.pricing?.shipping || 0,
          pricing: orderData.pricing,
          // Location information
          location: orderData.location,
          shippingAddress: orderData.shippingAddress,
          // Full order data
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
  
  return results.filter(Boolean).length;
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
      deliveryAmount: orderData.deliveryAmount || orderData.pricing?.deliveryAmount || orderData.pricing?.shipping || 0,
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

module.exports = {
  initializeSocket,
  getIO,
  sendOrderAssignmentRequest,
  sendOrderAssignmentRequestToRiders,
  notifyRiderOrderUpdate,
  getConnectedRidersCount,
  isRiderConnected,
};
