# WebSocket Usage for Rider Order Assignments

This document explains how to use the WebSocket connection for real-time order assignment notifications.

## Overview

The system uses Socket.io for real-time communication with riders. When an order status changes to "ready", riders assigned to the vendor receive instant notifications via WebSocket.

## Server Setup

The WebSocket server is automatically initialized when the Express server starts. It runs on the same port as the HTTP server.

## Client Connection

### 1. Install Socket.io Client

```bash
npm install socket.io-client
```

### 2. Connect to WebSocket

```javascript
import { io } from 'socket.io-client';

// Connect with authentication token
const socket = io('http://your-server-url', {
  auth: {
    token: 'your-jwt-token' // Rider's JWT token from login
  },
  transports: ['websocket', 'polling']
});

// Connection confirmation
socket.on('connected', (data) => {
  console.log('Connected to order assignment service:', data);
});

// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

// Handle disconnection
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

## Events

### Receiving Order Assignment Requests

When an order becomes ready, riders receive a `order_assignment_request` event:

```javascript
socket.on('order_assignment_request', (data) => {
  console.log('New order assignment available:', data);
  
  // data structure:
  // {
  //   type: 'order_assignment_request',
  //   title: 'New Order Assignment Available',
  //   message: 'Order RB12345678 is ready for delivery...',
  //   data: {
  //     orderId: '...',
  //     orderNumber: 'RB12345678',
  //     order: { ... } // Full order details
  //   },
  //   timestamp: '2024-01-01T00:00:00.000Z'
  // }
  
  // Show notification to rider
  showNotification(data);
  
  // Navigate to order details or show accept button
  handleOrderAssignment(data.data.orderId);
});
```

### Receiving Order Updates

Riders receive `order_update` events when their assigned orders are updated:

```javascript
socket.on('order_update', (data) => {
  console.log('Order updated:', data);
  
  // data structure:
  // {
  //   type: 'order_update',
  //   orderId: '...',
  //   orderNumber: 'RB12345678',
  //   status: 'out_for_delivery',
  //   data: { ... }, // Full order details
  //   timestamp: '2024-01-01T00:00:00.000Z'
  // }
  
  updateOrderStatus(data.orderId, data.status);
});
```

## Accepting Order Assignment

When a rider receives an assignment request, they can accept it via the REST API:

```javascript
// POST /api/rider/orders/:orderId/accept
const acceptOrder = async (orderId) => {
  try {
    const response = await fetch(`/api/rider/orders/${orderId}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('Order accepted:', result.data);
    }
  } catch (error) {
    console.error('Error accepting order:', error);
  }
};
```

## Check Connection Status

Riders can check their WebSocket connection status:

```javascript
// GET /api/rider/websocket/status
const checkStatus = async () => {
  const response = await fetch('/api/rider/websocket/status', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  console.log('Connection status:', result.data);
  // {
  //   connected: true,
  //   totalConnectedRiders: 5,
  //   message: 'You are connected to the real-time order assignment service'
  // }
};
```

## Authentication

The WebSocket connection requires JWT authentication. The token must be:
- Valid and not expired
- Belonging to a rider role
- Associated with an active and approved rider account

## Error Handling

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error);
  // Handle authentication errors, connection issues, etc.
});

socket.on('connect_error', (error) => {
  if (error.message === 'Authentication token required') {
    // Re-authenticate and reconnect
    reconnectWithNewToken();
  }
});
```

## Reconnection

Socket.io automatically handles reconnection. You can also manually reconnect:

```javascript
socket.connect(); // Reconnect
socket.disconnect(); // Disconnect
```

## Best Practices

1. **Store token securely**: Use secure storage for JWT tokens
2. **Handle reconnection**: Implement reconnection logic for network issues
3. **Show connection status**: Display connection status to riders
4. **Queue offline notifications**: Store notifications if rider is offline
5. **Clean up on unmount**: Disconnect socket when component unmounts

```javascript
// React example
useEffect(() => {
  const socket = io(serverUrl, { auth: { token } });
  
  socket.on('order_assignment_request', handleAssignment);
  socket.on('order_update', handleUpdate);
  
  return () => {
    socket.off('order_assignment_request');
    socket.off('order_update');
    socket.disconnect();
  };
}, [token]);
```

## Testing

To test the WebSocket connection:

1. Start the server
2. Login as a rider to get JWT token
3. Connect using Socket.io client with the token
4. Have a vendor mark an order as "ready"
5. Rider should receive `order_assignment_request` event
