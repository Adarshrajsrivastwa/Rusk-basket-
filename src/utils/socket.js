const mongoose = require('mongoose');
const logger = require('./logger');
const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const User = require('../models/User');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const {
  calculateDistance,
  correctLatLonIfLikelySwappedForSouthAsia,
} = require('./distanceUtils');

/** Safe payment summary for sockets (no card/UPI vault data). */
const paymentSummaryForSocket = (payment) => {
  if (!payment || typeof payment !== 'object') return null;
  return {
    method: payment.method ?? null,
    status: payment.status ?? null,
    amount: payment.amount ?? null,
    paidAt: payment.paidAt ?? null,
    transactionId: payment.transactionId || null,
  };
};

/**
 * Format order line items for socket payloads (user + rider apps).
 * @param {Array} items - Order.items from DB or populated order
 */
const formatOrderItemsForSocket = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const products = list.map((item) => {
    const productId = item.product?._id || item.product || null;
    const vendorId = item.vendor?._id || item.vendor || null;
    const thumbnailUrl =
      item.thumbnail?.url ||
      (typeof item.thumbnail === 'string' ? item.thumbnail : null) ||
      item.product?.thumbnail?.url ||
      item.image?.url ||
      null;

    return {
      productId: productId ? String(productId) : null,
      vendorId: vendorId ? String(vendorId) : null,
      vendorName: item.vendor?.storeName || item.vendor?.vendorName || null,
      productName:
        item.productName ||
        item.product?.productName ||
        item.product?.name ||
        null,
      quantity: Number(item.quantity) || 0,
      unitPrice: item.unitPrice ?? null,
      salePrice: item.salePrice ?? null,
      totalPrice: item.totalPrice ?? null,
      cashback: item.cashback ?? 0,
      tax: item.tax ?? 0,
      sku: item.sku || null,
      thumbnail: thumbnailUrl,
      image: item.image?.url || item.image || null,
    };
  });

  const totalItems = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  return {
    items: products,
    products,
    itemCount: products.length,
    uniqueProductCount: products.length,
    totalItems,
  };
};

/** Load order items from DB when socket payload omits them. */
const loadOrderItemsForSocket = async (orderId, existingItems) => {
  if (existingItems && existingItems.length > 0) {
    return existingItems;
  }
  if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    return [];
  }
  const dbOrder = await Order.findById(orderId)
    .select('items')
    .populate('items.product', 'productName name thumbnail')
    .populate('items.vendor', 'storeName vendorName')
    .lean();
  return dbOrder?.items || [];
};

/** Haversine km from rider currentAddress to order shipping (drop-off). */
const riderToDropoffDistanceKm = (riderDoc, shippingAddress) => {
  if (!riderDoc?.currentAddress || !shippingAddress) return null;
  const rLat = riderDoc.currentAddress.latitude;
  const rLon = riderDoc.currentAddress.longitude;
  const r = correctLatLonIfLikelySwappedForSouthAsia(rLat, rLon);
  const s = correctLatLonIfLikelySwappedForSouthAsia(
    shippingAddress.latitude,
    shippingAddress.longitude
  );
  if (
    !Number.isFinite(r.latitude) ||
    !Number.isFinite(r.longitude) ||
    !Number.isFinite(s.latitude) ||
    !Number.isFinite(s.longitude)
  ) {
    return null;
  }
  return calculateDistance(r.latitude, r.longitude, s.latitude, s.longitude);
};

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
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Handle different roles
        if (decoded.role === 'rider') {
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
          socket.role = 'rider';
          next();
        } else if (decoded.role === 'user') {
          // Verify user exists and is active
          const user = await User.findById(decoded.id);
          if (!user) {
            return next(new Error('User not found'));
          }

          if (!user.isActive) {
            return next(new Error('User account is inactive'));
          }

          socket.userId = decoded.id;
          socket.user = user;
          socket.role = 'user';
          next();
        } else {
          return next(new Error('Invalid role for socket connection'));
        }
      } catch (error) {
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
 * Load order + user + vendor pickup details from DB for rider assignment payloads.
 */
const fetchOrderPayloadForRiderAssignment = async (orderId) => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return null;
    }

    let userDetails = null;
    if (order.user) {
      const userId = order.user._id || order.user;
      const u = await User.findById(userId)
        .select('userName contactNumber email address addresses')
        .lean();

      if (u) {
        userDetails = {
          userName: u.userName || null,
          contactNumber: u.contactNumber || null,
          email: u.email || null,
          address: u.address || null,
          addresses: u.addresses || [],
        };
      }
    }

    const vendorIds = [...new Set((order.items || []).map((item) => {
      const vendorId = item.vendor?._id || item.vendor;
      return vendorId?.toString();
    }).filter(Boolean))];

    const vendorAddresses = [];
    if (vendorIds.length > 0) {
      const vendors = await Vendor.find({ _id: { $in: vendorIds } })
        .select('_id vendorName storeName storeAddress contactNumber')
        .lean();

      for (const vendor of vendors) {
        if (vendor.storeAddress) {
          vendorAddresses.push({
            _id: vendor._id,
            vendorName: vendor.vendorName || null,
            storeName: vendor.storeName || null,
            contactNumber: vendor.contactNumber || null,
            storeAddress: {
              line1: vendor.storeAddress.line1 || null,
              line2: vendor.storeAddress.line2 || null,
              pinCode: vendor.storeAddress.pinCode || null,
              city: vendor.storeAddress.city || null,
              state: vendor.storeAddress.state || null,
              latitude: vendor.storeAddress.latitude || null,
              longitude: vendor.storeAddress.longitude || null,
            },
          });
        }
      }
    }

    const payment = paymentSummaryForSocket(order.payment);
    const productSummary = formatOrderItemsForSocket(order.items);

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: productSummary.items,
      products: productSummary.products,
      itemCount: productSummary.itemCount,
      uniqueProductCount: productSummary.uniqueProductCount,
      totalItems: productSummary.totalItems,
      shippingAddress: order.shippingAddress || null,
      pricing: order.pricing || null,
      deliveryAmount: order.pricing?.deliveryAmount ?? order.deliveryAmount ?? null,
      payment,
      paymentMethod: payment?.method || null,
      estimatedDelivery: order.estimatedDelivery || null,
      assignedAt: order.assignedAt || null,
      deliveredAt: order.deliveredAt || null,
      cancelledAt: order.cancelledAt || null,
      cancellationReason: order.cancellationReason || null,
      cancelledBy: order.cancelledBy || null,
      notes: order.notes || null,
      coupon: order.coupon || null,
      cashbackUsed: order.cashbackUsed || null,
      rider: order.rider || null,
      updatedAt: order.updatedAt || null,
      user: userDetails,
      vendorAddresses,
      createdAt: order.createdAt,
    };
  } catch (error) {
    logger.error('fetchOrderPayloadForRiderAssignment failed:', error);
    return null;
  }
};

/**
 * Send order assignment request to a specific rider (payload must be DB-built, e.g. from fetchOrderPayloadForRiderAssignment).
 */
const sendOrderAssignmentRequest = async (riderId, orderData) => {
  const riderIdStr = riderId.toString();

  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for rider ${riderId}`);
    return false;
  }

  if (!orderData || !orderData._id) {
    logger.warn(`sendOrderAssignmentRequest: invalid order payload for rider ${riderId}`);
    return false;
  }
  
  try {
    const ioInstance = getIO();
    const socketId = connectedRiders.get(riderIdStr);

    const riderForDistance = await Rider.findById(riderId)
      .select('currentAddress.latitude currentAddress.longitude')
      .lean();
    const distanceToDropoffKm = riderToDropoffDistanceKm(
      riderForDistance,
      orderData.shippingAddress
    );
    const paymentMethod =
      orderData.paymentMethod ?? orderData.payment?.method ?? null;

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
      const productSummary = formatOrderItemsForSocket(orderData.items);

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

      const payLabel = paymentMethod ? `, Pay: ${paymentMethod}` : '';
      const distLabel =
        distanceToDropoffKm != null ? `, ~${distanceToDropoffKm} km to drop-off` : '';

      const notificationPayload = {
        type: 'order_assignment_request',
        title: 'New Order Assignment Available',
        message: `Order ${orderData.orderNumber} is ready for delivery. Amount: ₹${orderData.pricing?.total || 0}, Delivery: ₹${orderData.deliveryAmount || 0}, Rider Earnings: ₹${riderEarnings}${payLabel}${distLabel}.${vendorDetailsText}\nWould you like to accept?`,
        data: {
          // Order Basic Info
          _id: orderData._id,
          orderId: orderData._id,
          orderNumber: orderData.orderNumber,
          status: orderData.status,
          createdAt: orderData.createdAt,
          updatedAt: orderData.updatedAt || null,
          estimatedDelivery: orderData.estimatedDelivery || null,
          assignedAt: orderData.assignedAt || null,
          notes: orderData.notes || null,
          coupon: orderData.coupon || null,
          cashbackUsed: orderData.cashbackUsed || null,
          
          // Order Items / Products purchased by user
          items: productSummary.items,
          products: productSummary.products,
          itemCount: productSummary.itemCount,
          uniqueProductCount: productSummary.uniqueProductCount,
          totalItems: productSummary.totalItems,
          
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

          // Payment & distance (rider-specific)
          payment: orderData.payment || null,
          paymentMethod,
          distanceToDropoffKm,
          distanceToDropoffMeters:
            distanceToDropoffKm != null
              ? Math.round(distanceToDropoffKm * 1000)
              : null,
          
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
          
          // Full Order Object (for backward compatibility; includes rider-specific distance)
          order: {
            ...orderData,
            paymentMethod,
            distanceToDropoffKm,
            distanceToDropoffMeters:
              distanceToDropoffKm != null
                ? Math.round(distanceToDropoffKm * 1000)
                : null,
          },
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
 * Send order assignment request to multiple riders (orderPayload from fetchOrderPayloadForRiderAssignment).
 */
const sendOrderAssignmentRequestToRiders = async (riderIds, orderPayload) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notifications for ${riderIds.length} riders`);
    return 0;
  }

  if (!orderPayload || !orderPayload._id) {
    logger.warn('sendOrderAssignmentRequestToRiders: missing order payload');
    return 0;
  }

  const results = await Promise.all(
    riderIds.map((riderId) => sendOrderAssignmentRequest(riderId, orderPayload))
  );

  return results.filter(Boolean).length;
};

/**
 * Notify rider about order status update (merges latest order from DB when orderId is present).
 */
const notifyRiderOrderUpdate = async (riderId, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for rider ${riderId}`);
    return;
  }

  if (!orderData || typeof orderData !== 'object') {
    return;
  }

  try {
    const ioInstance = getIO();
    const rid = riderId ? riderId.toString() : null;
    const orderId = orderData.orderId || orderData._id;

    let merged = { ...orderData };
    let shippingSrc = orderData.shippingAddress;
    let pricing = orderData.pricing || {};
    let payment = paymentSummaryForSocket(orderData.payment);
    let paymentMethod = orderData.paymentMethod ?? payment?.method ?? null;

    if (orderId && mongoose.Types.ObjectId.isValid(String(orderId))) {
      const dbOrder = await Order.findById(orderId)
        .select(
          'payment shippingAddress pricing deliveryAmount status orderNumber items estimatedDelivery assignedAt deliveredAt cancelledAt cancellationReason cancelledBy notes coupon cashbackUsed rider updatedAt createdAt'
        )
        .lean();

      if (dbOrder) {
        merged = {
          ...dbOrder,
          ...orderData,
          orderId: orderData.orderId || dbOrder._id,
          orderNumber: orderData.orderNumber ?? dbOrder.orderNumber,
          status: orderData.status ?? dbOrder.status,
        };
        shippingSrc = orderData.shippingAddress || dbOrder.shippingAddress;
        pricing = { ...(dbOrder.pricing || {}), ...(orderData.pricing || {}) };
        payment =
          paymentSummaryForSocket(orderData.payment) ||
          paymentSummaryForSocket(dbOrder.payment);
        paymentMethod =
          orderData.paymentMethod ??
          payment?.method ??
          dbOrder.payment?.method ??
          null;
      }
    }

    let distanceToDropoffKm = orderData.distanceToDropoffKm ?? null;
    if (rid && distanceToDropoffKm == null) {
      const riderLean = await Rider.findById(rid)
        .select('currentAddress.latitude currentAddress.longitude')
        .lean();
      distanceToDropoffKm = riderToDropoffDistanceKm(riderLean, shippingSrc);
    }

    // Format shipping address properly
    const formattedShippingAddress = shippingSrc
      ? {
          line1: shippingSrc.line1 || '',
          line2: shippingSrc.line2 || '',
          city: shippingSrc.city || '',
          state: shippingSrc.state || '',
          pinCode: shippingSrc.pinCode || '',
          phone: shippingSrc.phone || '',
          latitude: shippingSrc.latitude ?? null,
          longitude: shippingSrc.longitude ?? null,
        }
      : null;

    // Build location information
    const location = formattedShippingAddress
      ? {
          address: [
            formattedShippingAddress.line1,
            formattedShippingAddress.line2,
            formattedShippingAddress.city,
            formattedShippingAddress.state,
            formattedShippingAddress.pinCode,
          ]
            .filter(Boolean)
            .join(', '),
          line1: formattedShippingAddress.line1,
          line2: formattedShippingAddress.line2,
          city: formattedShippingAddress.city,
          state: formattedShippingAddress.state,
          pinCode: formattedShippingAddress.pinCode,
          phone: formattedShippingAddress.phone,
          coordinates: {
            latitude: formattedShippingAddress.latitude,
            longitude: formattedShippingAddress.longitude,
          },
        }
      : orderData.location || null;

    const deliveryAmt =
      merged.deliveryAmount ??
      orderData.deliveryAmount ??
      pricing?.deliveryAmount ??
      0;

    const itemsForSocket = await loadOrderItemsForSocket(
      orderId,
      merged.items || orderData.items
    );
    const productSummary = formatOrderItemsForSocket(itemsForSocket);

    const updatePayload = {
      type: 'order_update',
      orderId: merged.orderId || merged._id,
      orderNumber: merged.orderNumber,
      status: merged.status,
      items: productSummary.items,
      products: productSummary.products,
      itemCount: productSummary.itemCount,
      uniqueProductCount: productSummary.uniqueProductCount,
      totalItems: productSummary.totalItems,
      amount:
        orderData.amount ??
        merged.pricing?.total ??
        pricing?.total ??
        0,
      deliveryAmount: deliveryAmt,
      pricing: pricing || {},
      payment,
      paymentMethod,
      distanceToDropoffKm,
      distanceToDropoffMeters:
        distanceToDropoffKm != null
          ? Math.round(distanceToDropoffKm * 1000)
          : null,
      estimatedDelivery: merged.estimatedDelivery ?? null,
      assignedAt: merged.assignedAt ?? null,
      deliveredAt: merged.deliveredAt ?? orderData.deliveredAt ?? null,
      cancelledAt: merged.cancelledAt ?? null,
      cancellationReason: merged.cancellationReason ?? null,
      cancelledBy: merged.cancelledBy ?? null,
      notes: merged.notes ?? null,
      coupon: merged.coupon ?? null,
      cashbackUsed: merged.cashbackUsed ?? null,
      location,
      shippingAddress: formattedShippingAddress || {},
      rider: orderData.rider ?? merged.rider ?? null,
      data: {
        ...merged,
        ...productSummary,
        pricing,
        payment,
        paymentMethod,
        shippingAddress: shippingSrc || formattedShippingAddress,
        distanceToDropoffKm,
        distanceToDropoffMeters:
          distanceToDropoffKm != null
            ? Math.round(distanceToDropoffKm * 1000)
            : null,
      },
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
 * Send order update to user (includes all purchased products).
 */
const notifyUserOrderUpdate = async (userId, orderData) => {
  if (!socketIOAvailable || !io) {
    logger.debug(`Socket.io not available. Skipping WebSocket notification for user ${userId}`);
    return;
  }

  if (!orderData || typeof orderData !== 'object') {
    return;
  }

  try {
    const ioInstance = getIO();
    const orderId = orderData.orderId || orderData._id;

    let merged = { ...orderData };
    let pricing = orderData.pricing || {};
    let payment = paymentSummaryForSocket(orderData.payment);

    if (orderId && mongoose.Types.ObjectId.isValid(String(orderId))) {
      const dbOrder = await Order.findById(orderId)
        .select(
          'items payment shippingAddress pricing deliveryAmount status orderNumber estimatedDelivery assignedAt deliveredAt cancelledAt cancellationReason cancelledBy notes coupon cashbackUsed rider updatedAt createdAt'
        )
        .lean();

      if (dbOrder) {
        merged = {
          ...dbOrder,
          ...orderData,
          orderId: orderData.orderId || dbOrder._id,
          orderNumber: orderData.orderNumber ?? dbOrder.orderNumber,
          status: orderData.status ?? dbOrder.status,
        };
        pricing = { ...(dbOrder.pricing || {}), ...(orderData.pricing || {}) };
        payment =
          paymentSummaryForSocket(orderData.payment) ||
          paymentSummaryForSocket(dbOrder.payment);
      }
    }

    const itemsForSocket = await loadOrderItemsForSocket(
      orderId,
      merged.items || orderData.items
    );
    const productSummary = formatOrderItemsForSocket(itemsForSocket);

    const updatePayload = {
      type: 'order_update',
      orderId: merged.orderId || merged._id,
      orderNumber: merged.orderNumber,
      status: merged.status,
      amount: orderData.amount ?? pricing?.total ?? 0,
      deliveryAmount:
        merged.deliveryAmount ?? orderData.deliveryAmount ?? pricing?.deliveryAmount ?? 0,
      pricing,
      payment,
      items: productSummary.items,
      products: productSummary.products,
      itemCount: productSummary.itemCount,
      uniqueProductCount: productSummary.uniqueProductCount,
      totalItems: productSummary.totalItems,
      shippingAddress: orderData.shippingAddress || merged.shippingAddress || {},
      cancelledBy: merged.cancelledBy ?? orderData.cancelledBy ?? null,
      cancellationReason: merged.cancellationReason ?? orderData.cancellationReason ?? null,
      data: {
        ...merged,
        ...productSummary,
        pricing,
        payment,
      },
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
  formatOrderItemsForSocket,
  fetchOrderPayloadForRiderAssignment,
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
