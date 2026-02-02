# Ticket System API Documentation

## Overview

The Ticket System allows Users, Vendors, and Riders to create support tickets and communicate with Admins. All conversations are saved in the database with proper status tracking.

## Table of Contents

1. [User Ticket APIs](#user-ticket-apis)
2. [Vendor Ticket APIs](#vendor-ticket-apis)
3. [Rider Ticket APIs](#rider-ticket-apis)
4. [Admin Ticket APIs](#admin-ticket-apis)
5. [Data Models](#data-models)
6. [Status Flow](#status-flow)
7. [Error Handling](#error-handling)
8. [Examples](#examples)

---

## User Ticket APIs

Base URL: `/api/user/tickets`

### 1. Create Ticket

Create a new support ticket.

**Endpoint:** `POST /api/user/tickets`

**Authentication:** Required (User token)

**Request Body:**
```json
{
  "complaint": "My order is delayed. Order number is #12345",
  "category": "order_delivery",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Request Parameters:**
- `complaint` (required, string, 10-2000 characters): The main complaint/query text
- `category` (optional, enum): One of:
  - `order_delivery`
  - `account_profile`
  - `payments_refunds`
  - `login_otp`
  - `general_queries` (default)
- `orderId` (optional, MongoDB ObjectId): Related order ID

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT123456",
      "user": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "John Doe",
        "contactNumber": "9876543210",
        "email": "john@example.com"
      },
      "createdBy": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "John Doe",
        "contactNumber": "9876543210",
        "email": "john@example.com"
      },
      "createdByModel": "User",
      "category": "order_delivery",
      "complaint": "My order is delayed. Order number is #12345",
      "status": "active",
      "orderId": {
        "_id": "507f1f77bcf86cd799439011",
        "orderNumber": "ORD123",
        "totalAmount": 1500,
        "status": "pending"
      },
      "messages": [
        {
          "sender": {
            "_id": "507f1f77bcf86cd799439012",
            "userName": "John Doe",
            "contactNumber": "9876543210",
            "email": "john@example.com"
          },
          "senderModel": "User",
          "message": "My order is delayed. Order number is #12345",
          "createdAt": "2024-01-15T10:30:00.000Z"
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

---

### 2. Get All Tickets

Get all tickets for the logged-in user.

**Endpoint:** `GET /api/user/tickets`

**Authentication:** Required (User token)

**Query Parameters:**
- `page` (optional, integer, min: 1): Page number (default: 1)
- `limit` (optional, integer, 1-100): Items per page (default: 10)
- `status` (optional, enum): Filter by status
  - `active`
  - `pending`
  - `resolved`
  - `closed`
- `category` (optional, enum): Filter by category

**Example Request:**
```
GET /api/user/tickets?page=1&limit=10&status=active&category=order_delivery
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tickets fetched successfully",
  "data": {
    "tickets": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "ticketNumber": "TKT123456",
        "category": "order_delivery",
        "complaint": "My order is delayed",
        "status": "active",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "messages": [...]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

---

### 3. Get Single Ticket

Get details of a specific ticket.

**Endpoint:** `GET /api/user/tickets/:ticketId`

**Authentication:** Required (User token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Ticket fetched successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT123456",
      "category": "order_delivery",
      "complaint": "My order is delayed",
      "status": "active",
      "messages": [
        {
          "sender": {
            "userName": "John Doe",
            "email": "john@example.com"
          },
          "senderModel": "User",
          "message": "My order is delayed",
          "createdAt": "2024-01-15T10:30:00.000Z"
        },
        {
          "sender": {
            "name": "Admin User",
            "email": "admin@example.com"
          },
          "senderModel": "Admin",
          "message": "We are looking into this issue",
          "createdAt": "2024-01-15T11:00:00.000Z"
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

### 4. Update Ticket

Update ticket details (only for active/pending tickets).

**Endpoint:** `PATCH /api/user/tickets/:ticketId`

**Authentication:** Required (User token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "complaint": "Updated complaint text",
  "category": "payments_refunds",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Note:** At least one field (complaint, category, or orderId) must be provided.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Ticket updated successfully",
  "data": {
    "ticket": {...}
  }
}
```

---

### 5. Add Message to Ticket

Add a message to an existing ticket.

**Endpoint:** `POST /api/user/tickets/:ticketId/messages`

**Authentication:** Required (User token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "message": "Can you please check the order status?"
}
```

**Request Parameters:**
- `message` (required, string, 1-2000 characters): Message text

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Message added successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "messages": [
        {
          "sender": {...},
          "senderModel": "User",
          "message": "Can you please check the order status?",
          "createdAt": "2024-01-15T12:00:00.000Z"
        }
      ]
    }
  }
}
```

---

## Vendor Ticket APIs

Base URL: `/api/vendor/tickets`

### 1. Create Ticket

Create a new support ticket (Vendor).

**Endpoint:** `POST /api/vendor/tickets`

**Authentication:** Required (Vendor token)

**Request Body:**
```json
{
  "complaint": "I need help with my product approval process",
  "category": "account_profile",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Request Parameters:**
- `complaint` (required, string, 10-2000 characters): The main complaint/query text
- `category` (optional, enum): Same as user tickets
- `orderId` (optional, MongoDB ObjectId): Related order ID

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT789012",
      "vendor": {
        "_id": "507f1f77bcf86cd799439013",
        "vendorName": "ABC Store",
        "storeName": "ABC Grocery",
        "contactNumber": "9876543210",
        "email": "vendor@example.com"
      },
      "createdBy": {
        "_id": "507f1f77bcf86cd799439013",
        "vendorName": "ABC Store",
        "storeName": "ABC Grocery",
        "contactNumber": "9876543210",
        "email": "vendor@example.com"
      },
      "createdByModel": "Vendor",
      "category": "account_profile",
      "complaint": "I need help with my product approval process",
      "status": "active",
      "messages": [...]
    }
  }
}
```

---

### 2. Get All Tickets

Get all tickets for the logged-in vendor.

**Endpoint:** `GET /api/vendor/tickets`

**Authentication:** Required (Vendor token)

**Query Parameters:**
- `page` (optional, integer, min: 1): Page number (default: 1)
- `limit` (optional, integer, 1-100): Items per page (default: 10)
- `status` (optional, enum): Filter by status
- `category` (optional, enum): Filter by category

**Example Request:**
```
GET /api/vendor/tickets?page=1&limit=10&status=active
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tickets fetched successfully",
  "data": {
    "tickets": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "pages": 2
    }
  }
}
```

---

### 3. Get Single Ticket

Get details of a specific ticket.

**Endpoint:** `GET /api/vendor/tickets/:ticketId`

**Authentication:** Required (Vendor token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Ticket fetched successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT789012",
      "category": "account_profile",
      "complaint": "I need help with my product approval process",
      "status": "active",
      "messages": [
        {
          "sender": {
            "vendorName": "ABC Store",
            "storeName": "ABC Grocery"
          },
          "senderModel": "Vendor",
          "message": "I need help with my product approval process",
          "createdAt": "2024-01-15T10:30:00.000Z"
        },
        {
          "sender": {
            "name": "Admin User",
            "email": "admin@example.com"
          },
          "senderModel": "Admin",
          "message": "We will help you with the approval process",
          "createdAt": "2024-01-15T11:00:00.000Z"
        }
      ]
    }
  }
}
```

---

### 4. Add Message to Ticket

Add a message to an existing ticket.

**Endpoint:** `POST /api/vendor/tickets/:ticketId/messages`

**Authentication:** Required (Vendor token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "message": "Thank you for your response. When can I expect the approval?"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Message added successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "messages": [...]
    }
  }
}
```

---

## Rider Ticket APIs

Base URL: `/api/rider/tickets`

### 1. Create Ticket

Create a new support ticket (Rider).

**Endpoint:** `POST /api/rider/tickets`

**Authentication:** Required (Rider token)

**Request Body:**
```json
{
  "complaint": "I need help with my payment issue",
  "category": "payments_refunds",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Request Parameters:**
- `complaint` (required, string, 10-2000 characters): The main complaint/query text
- `category` (optional, enum): Same as user/vendor tickets
- `orderId` (optional, MongoDB ObjectId): Related order ID

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT345678",
      "rider": {
        "_id": "507f1f77bcf86cd799439014",
        "fullName": "Rider Name",
        "mobileNumber": "9876543210",
        "email": "rider@example.com"
      },
      "createdBy": {
        "_id": "507f1f77bcf86cd799439014",
        "fullName": "Rider Name",
        "mobileNumber": "9876543210",
        "email": "rider@example.com"
      },
      "createdByModel": "Rider",
      "category": "payments_refunds",
      "complaint": "I need help with my payment issue",
      "status": "active",
      "messages": [...]
    }
  }
}
```

---

### 2. Get All Tickets

Get all tickets for the logged-in rider.

**Endpoint:** `GET /api/rider/tickets`

**Authentication:** Required (Rider token)

**Query Parameters:**
- `page` (optional, integer, min: 1): Page number (default: 1)
- `limit` (optional, integer, 1-100): Items per page (default: 10)
- `status` (optional, enum): Filter by status
- `category` (optional, enum): Filter by category

**Example Request:**
```
GET /api/rider/tickets?page=1&limit=10&status=active
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tickets fetched successfully",
  "data": {
    "tickets": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 8,
      "pages": 1
    }
  }
}
```

---

### 3. Get Single Ticket

Get details of a specific ticket.

**Endpoint:** `GET /api/rider/tickets/:ticketId`

**Authentication:** Required (Rider token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Ticket fetched successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "ticketNumber": "TKT345678",
      "category": "payments_refunds",
      "complaint": "I need help with my payment issue",
      "status": "active",
      "messages": [
        {
          "sender": {
            "fullName": "Rider Name",
            "mobileNumber": "9876543210"
          },
          "senderModel": "Rider",
          "message": "I need help with my payment issue",
          "createdAt": "2024-01-15T10:30:00.000Z"
        },
        {
          "sender": {
            "name": "Admin User",
            "email": "admin@example.com"
          },
          "senderModel": "Admin",
          "message": "We will help you with the payment issue",
          "createdAt": "2024-01-15T11:00:00.000Z"
        }
      ]
    }
  }
}
```

---

### 4. Add Message to Ticket

Add a message to an existing ticket.

**Endpoint:** `POST /api/rider/tickets/:ticketId/messages`

**Authentication:** Required (Rider token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "message": "When will I receive my payment?"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Message added successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "messages": [...]
    }
  }
}
```

---

## Admin Ticket APIs

Base URL: `/api/ticket`

### 1. Get All Tickets

Get all tickets (User, Vendor, and Rider tickets).

**Endpoint:** `GET /api/ticket`

**Authentication:** Required (Admin token)

**Query Parameters:**
- `page` (optional, integer, min: 1): Page number (default: 1)
- `limit` (optional, integer, 1-100): Items per page (default: 10)
- `status` (optional, enum): Filter by status
- `category` (optional, enum): Filter by category
- `search` (optional, string, max: 200): Search in ticket number or complaint

**Example Request:**
```
GET /api/ticket?page=1&limit=20&status=active&search=TKT123
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Tickets fetched successfully",
  "data": {
    "tickets": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "ticketNumber": "TKT123456",
        "createdByModel": "User",
        "user": {
          "userName": "John Doe",
          "email": "john@example.com"
        },
        "category": "order_delivery",
        "complaint": "My order is delayed",
        "status": "active",
        "messages": [...]
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "ticketNumber": "TKT789012",
        "createdByModel": "Vendor",
        "vendor": {
          "vendorName": "ABC Store",
          "storeName": "ABC Grocery",
          "email": "vendor@example.com"
        },
        "category": "account_profile",
        "complaint": "I need help with product approval",
        "status": "pending",
        "messages": [...]
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "ticketNumber": "TKT345678",
        "createdByModel": "Rider",
        "rider": {
          "fullName": "Rider Name",
          "mobileNumber": "9876543210",
          "email": "rider@example.com"
        },
        "category": "payments_refunds",
        "complaint": "I need help with my payment issue",
        "status": "active",
        "messages": [...]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "pages": 3
    }
  }
}
```

---

### 2. Update Ticket Status

Update the status of a ticket.

**Endpoint:** `PATCH /api/ticket/:ticketId/status`

**Authentication:** Required (Admin token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "status": "resolved",
  "adminResponse": "Issue has been resolved. Order will be delivered by tomorrow."
}
```

**Request Parameters:**
- `status` (required, enum): New status
  - `active`
  - `pending`
  - `resolved`
  - `closed`
- `adminResponse` (optional, string, max: 2000): Admin's response/notes

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Ticket status updated successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "status": "resolved",
      "resolvedBy": {
        "_id": "507f1f77bcf86cd799439014",
        "name": "Admin User",
        "email": "admin@example.com"
      },
      "resolvedAt": "2024-01-15T14:00:00.000Z",
      "adminResponse": "Issue has been resolved. Order will be delivered by tomorrow.",
      "statusChangedBy": {
        "_id": "507f1f77bcf86cd799439014",
        "name": "Admin User",
        "email": "admin@example.com"
      }
    }
  }
}
```

---

### 3. Add Admin Message

Add a message to a ticket (Admin).

**Endpoint:** `POST /api/ticket/:ticketId/messages`

**Authentication:** Required (Admin token)

**URL Parameters:**
- `ticketId` (required, MongoDB ObjectId): Ticket ID

**Request Body:**
```json
{
  "message": "We are investigating your issue. We will update you soon."
}
```

**Request Parameters:**
- `message` (required, string, 1-2000 characters): Message text

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Message added successfully",
  "data": {
    "ticket": {
      "_id": "507f1f77bcf86cd799439011",
      "messages": [
        {
          "sender": {
            "name": "Admin User",
            "email": "admin@example.com"
          },
          "senderModel": "Admin",
          "message": "We are investigating your issue. We will update you soon.",
          "createdAt": "2024-01-15T13:00:00.000Z"
        }
      ]
    }
  }
}
```

---

## Data Models

### Ticket Schema

```javascript
{
  ticketNumber: String,        // Unique ticket number (e.g., "TKT123456")
  user: ObjectId,             // User ID (for user tickets)
  vendor: ObjectId,           // Vendor ID (for vendor tickets)
  rider: ObjectId,            // Rider ID (for rider tickets)
  createdBy: ObjectId,        // Creator ID (refPath: createdByModel)
  createdByModel: String,      // "User", "Vendor", or "Rider"
  category: String,           // Enum: order_delivery, account_profile, payments_refunds, login_otp, general_queries
  complaint: String,          // Main complaint text (max: 2000 chars)
  status: String,             // Enum: active, pending, resolved, closed
  orderId: ObjectId,          // Related order (optional)
  adminResponse: String,       // Admin's final response (optional)
  resolvedAt: Date,           // Resolution timestamp
  resolvedBy: ObjectId,       // Admin who resolved
  statusChangedBy: ObjectId,  // Admin who changed status
  messages: [                 // Conversation history
    {
      sender: ObjectId,       // Sender ID (refPath: senderModel)
      senderModel: String,    // "User", "Vendor", "Rider", or "Admin"
      message: String,         // Message text (max: 2000 chars)
      createdAt: Date          // Message timestamp
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

---

## Status Flow

```
active → pending → resolved → closed
  ↓         ↓         ↓
  └─────────┴─────────┘
    (can go back to active/pending)
```

**Status Descriptions:**
- `active`: New ticket, awaiting admin response
- `pending`: Admin is working on it
- `resolved`: Issue resolved, ticket closed
- `closed`: Ticket permanently closed

**Rules:**
- Only admins can change ticket status
- Users/Vendors/Riders cannot update tickets with status "resolved" or "closed"
- Messages cannot be added to "closed" tickets

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    {
      "msg": "Complaint is required",
      "param": "complaint",
      "location": "body"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Not authorized to access this route. Token is required."
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Access denied. Vendor privileges required."
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Ticket not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Failed to create ticket",
  "message": "Error details..."
}
```

---

## Examples

### Complete Flow Example

#### 1. User Creates Ticket
```bash
POST /api/user/tickets
Authorization: Bearer <user_token>

{
  "complaint": "My order #ORD123 has not been delivered yet",
  "category": "order_delivery",
  "orderId": "507f1f77bcf86cd799439011"
}
```

#### 2. Admin Views All Tickets
```bash
GET /api/ticket?status=active
Authorization: Bearer <admin_token>
```

#### 3. Admin Responds
```bash
POST /api/ticket/507f1f77bcf86cd799439011/messages
Authorization: Bearer <admin_token>

{
  "message": "We are checking your order status. Will update you in 2 hours."
}
```

#### 4. User Replies
```bash
POST /api/user/tickets/507f1f77bcf86cd799439011/messages
Authorization: Bearer <user_token>

{
  "message": "Thank you. Please let me know as soon as possible."
}
```

#### 5. Admin Updates Status
```bash
PATCH /api/ticket/507f1f77bcf86cd799439011/status
Authorization: Bearer <admin_token>

{
  "status": "resolved",
  "adminResponse": "Order has been dispatched. Tracking number: TRACK123"
}
```

---

### Vendor Ticket Example

#### 1. Vendor Creates Ticket
```bash
POST /api/vendor/tickets
Authorization: Bearer <vendor_token>

{
  "complaint": "I need help updating my store information",
  "category": "account_profile"
}
```

#### 2. Admin Responds
```bash
POST /api/ticket/507f1f77bcf86cd799439012/messages
Authorization: Bearer <admin_token>

{
  "message": "Please provide the details you want to update."
}
```

#### 3. Vendor Replies
```bash
POST /api/vendor/tickets/507f1f77bcf86cd799439012/messages
Authorization: Bearer <vendor_token>

{
  "message": "I want to change my store address and phone number."
}
```

---

### Rider Ticket Example

#### 1. Rider Creates Ticket
```bash
POST /api/rider/tickets
Authorization: Bearer <rider_token>

{
  "complaint": "I have not received my payment for last month",
  "category": "payments_refunds"
}
```

#### 2. Admin Responds
```bash
POST /api/ticket/507f1f77bcf86cd799439013/messages
Authorization: Bearer <admin_token>

{
  "message": "We are checking your payment records. Will update you shortly."
}
```

#### 3. Rider Replies
```bash
POST /api/rider/tickets/507f1f77bcf86cd799439013/messages
Authorization: Bearer <rider_token>

{
  "message": "Thank you. Please process the payment as soon as possible."
}
```

---

## Authentication

All endpoints require authentication:
- **User endpoints**: User JWT token
- **Vendor endpoints**: Vendor JWT token
- **Rider endpoints**: Rider JWT token
- **Admin endpoints**: Admin JWT token

Token should be sent in:
- `Authorization` header: `Bearer <token>`
- Or in cookies: `token=<token>`

---

## Rate Limiting

Currently no rate limiting is implemented. Consider implementing rate limiting for production.

---

## Notes

1. **Ticket Numbers**: Automatically generated unique ticket numbers (format: `TKT` + 6 digits)
2. **Message History**: All messages are saved in chronological order
3. **Status Updates**: Only admins can update ticket status
4. **Closed Tickets**: Cannot add messages to closed tickets
5. **Pagination**: Default page size is 10, maximum is 100
6. **Search**: Admin can search by ticket number or complaint text

---

## Support

For issues or questions, contact the development team.
