# Rider Notification System - API Guide

## Overview (समझौता)

Jab vendor order status ko **"ready"** karta hai, tab automatically associated riders ko notification jata hai. Ye notification **WebSocket** ke through real-time me jata hai, aur agar rider offline ho to **notification queue** me store ho jata hai.

## Flow (कैसे काम करता है)

### 1. Order Status "Ready" Hone Par (जब order ready होता है)

**Location:** `src/controllers/vendor.js` (line 732-744)

```javascript
// If status changed to 'ready', notify riders
if (status === 'ready' && previousStatus !== 'ready') {
  await checkoutService.notifyRidersForOrder(order);
}
```

### 2. Notification Process (Notification कैसे भेजा जाता है)

**Location:** `src/services/checkoutService.js` (line 1330-1482)

**Steps:**
1. Order se vendor IDs extract karta hai
2. Un vendors ke associated active riders ko find karta hai
3. Order me `assignmentRequestSentTo` array me rider IDs add karta hai
4. **WebSocket** ke through real-time notification bhejta hai
5. Agar rider offline ho to **notification queue** me add karta hai

## Rider Frontend Ke Liye Required APIs

### 1. WebSocket Connection (Real-time Notifications)

**Connection:**
```javascript
// Socket.io client se connect karo
const socket = io('YOUR_SERVER_URL', {
  auth: {
    token: 'RIDER_JWT_TOKEN' // Rider login ke baad milne wala token
  }
});

// Connection confirm
socket.on('connected', (data) => {
  console.log('Connected:', data);
});

// Order assignment request receive karo
socket.on('order_assignment_request', (notification) => {
  // notification structure:
  // {
  //   type: 'order_assignment_request',
  //   title: 'New Order Assignment Available',
  //   message: 'Order #123 is ready for delivery...',
  //   data: {
  //     orderId: '...',
  //     orderNumber: '...',
  //     amount: 500,
  //     deliveryAmount: 50,
  //     location: { ... },
  //     shippingAddress: { ... }
  //   }
  // }
});
```

**API Endpoint:** WebSocket connection check karne ke liye
- `GET /api/rider/websocket/status`
- **Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "totalConnectedRiders": 5,
    "message": "You are connected to the real-time order assignment service"
  }
}
```

### 2. Available Orders API (Available Orders Dekhne Ke Liye)

**Endpoint:** `GET /api/rider/orders/available`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)

**Headers:**
```
Authorization: Bearer RIDER_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  },
  "data": [
    {
      "_id": "order_id",
      "orderNumber": "ORD-123456",
      "status": "ready",
      "pricing": {
        "subtotal": 450,
        "discount": 0,
        "tax": 22.5,
        "total": 500,
        "deliveryAmount": 50
      },
      "deliveryAmount": 50,
      "shippingAddress": {
        "line1": "123 Main St",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pinCode": "400001",
        "latitude": 19.0760,
        "longitude": 72.8777
      },
      "items": [...],
      "user": {
        "userName": "John Doe",
        "contactNumber": "9876543210"
      },
      "assignmentRequestSentTo": [
        {
          "rider": "rider_id",
          "status": "pending",
          "requestedAt": "2024-01-01T10:00:00Z"
        }
      ]
    }
  ]
}
```

### 3. Accept Order API (Order Accept Karne Ke Liye)

**Endpoint:** `POST /api/rider/orders/:orderId/accept`

**Headers:**
```
Authorization: Bearer RIDER_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Order assignment accepted successfully",
  "data": {
    "_id": "order_id",
    "orderNumber": "ORD-123456",
    "status": "out_for_delivery",
    "rider": {
      "_id": "rider_id",
      "fullName": "Rider Name",
      "mobileNumber": "9876543210"
    },
    "assignedAt": "2024-01-01T10:05:00Z",
    "pricing": { ... },
    "shippingAddress": { ... },
    "items": [ ... ]
  }
}
```

**Note:** Agar order already assign ho chuka ho to:
```json
{
  "success": false,
  "error": "This order has already been assigned to another rider. Another rider accepted it just before you.",
  "assignedRider": {
    "name": "Other Rider Name",
    "mobile": "9876543210"
  }
}
```

### 4. Reject Order API (Order Reject Karne Ke Liye)

**Endpoint:** `POST /api/rider/orders/:orderId/reject`

**Headers:**
```
Authorization: Bearer RIDER_JWT_TOKEN
```

**Body (optional):**
```json
{
  "reason": "Too far from my location"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order assignment rejected successfully",
  "data": {
    "orderId": "order_id",
    "orderNumber": "ORD-123456",
    "status": "rejected"
  }
}
```

### 5. My Orders API (Rider Ke Assigned Orders)

**Endpoint:** `GET /api/rider/orders/my-orders`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `status` (optional): Filter by status (`pending`, `confirmed`, `processing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`)

**Headers:**
```
Authorization: Bearer RIDER_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  },
  "data": [
    {
      "_id": "order_id",
      "orderNumber": "ORD-123456",
      "status": "out_for_delivery",
      "assignedAt": "2024-01-01T10:05:00Z",
      "pricing": { ... },
      "shippingAddress": { ... },
      "items": [ ... ],
      "user": { ... }
    }
  ]
}
```

### 6. Order Update Notifications (WebSocket)

Jab order status update hota hai, rider ko automatically notification milta hai:

**Event:** `order_update`

**Payload:**
```json
{
  "type": "order_update",
  "orderId": "order_id",
  "orderNumber": "ORD-123456",
  "status": "delivered",
  "amount": 500,
  "deliveryAmount": 50,
  "pricing": { ... },
  "location": {
    "address": "123 Main St, Mumbai, Maharashtra, 400001",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pinCode": "400001",
    "coordinates": {
      "latitude": 19.0760,
      "longitude": 72.8777
    }
  },
  "shippingAddress": { ... },
  "timestamp": "2024-01-01T10:10:00Z"
}
```

## Frontend Implementation Example

```javascript
// 1. WebSocket Connection Setup
import io from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  auth: {
    token: localStorage.getItem('riderToken')
  }
});

// 2. Listen for order assignment requests
socket.on('order_assignment_request', (notification) => {
  // Show notification to rider
  showNotification({
    title: notification.title,
    message: notification.message,
    orderId: notification.data.orderId,
    amount: notification.data.amount,
    deliveryAmount: notification.data.deliveryAmount,
    location: notification.data.location
  });
  
  // Update available orders list
  fetchAvailableOrders();
});

// 3. Listen for order updates
socket.on('order_update', (update) => {
  // Update order status in UI
  updateOrderStatus(update.orderId, update.status);
});

// 4. Fetch available orders
async function fetchAvailableOrders(page = 1) {
  const response = await fetch(`/api/rider/orders/available?page=${page}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('riderToken')}`
    }
  });
  const data = await response.json();
  return data;
}

// 5. Accept order
async function acceptOrder(orderId) {
  const response = await fetch(`/api/rider/orders/${orderId}/accept`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('riderToken')}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return data;
}

// 6. Reject order
async function rejectOrder(orderId, reason = '') {
  const response = await fetch(`/api/rider/orders/${orderId}/reject`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('riderToken')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  const data = await response.json();
  return data;
}
```

## Important Points (महत्वपूर्ण बातें)

1. **WebSocket Connection:** Real-time notifications ke liye WebSocket connection zaroori hai
2. **Token Authentication:** Har API call me rider JWT token required hai
3. **Race Condition:** Multiple riders ek hi order accept kar sakte hain, isliye backend me atomic operations use kiye gaye hain
4. **Offline Riders:** Agar rider offline ho to notification queue me store ho jata hai, baad me fetch kar sakte hain
5. **Vendor Association:** Rider sirf apne associated vendor ke orders hi dekh sakta hai

## Notification Queue (Offline Riders Ke Liye)

Agar WebSocket fail ho ya rider offline ho, to notification queue me store ho jata hai. Future me ek API add kar sakte hain jo pending notifications fetch kare:

```javascript
// Future API (abhi implement nahi hai)
GET /api/rider/notifications/pending
```

## Summary

Rider frontend ko ye APIs chahiye:
1. ✅ WebSocket connection (real-time notifications)
2. ✅ `GET /api/rider/orders/available` (available orders)
3. ✅ `POST /api/rider/orders/:orderId/accept` (accept order)
4. ✅ `POST /api/rider/orders/:orderId/reject` (reject order)
5. ✅ `GET /api/rider/orders/my-orders` (my orders)
6. ✅ `GET /api/rider/websocket/status` (connection status)

Sab APIs already implement ho chuki hain! Bas frontend me integrate karna hai.
