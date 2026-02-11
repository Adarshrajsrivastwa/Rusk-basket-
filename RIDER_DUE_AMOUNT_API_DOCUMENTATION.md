# Rider Due Amount APIs Documentation

## Overview
Yeh APIs vendors ko allow karti hain ki wo apne associated riders ke due amounts ko view aur update kar saken.

---

## API 1: Get All Riders' Due Amounts

### Endpoint
```
GET /api/vendor/riders/due-amounts
```

### Authentication
- Vendor authentication required (Bearer token)

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | Integer | No | Page number (default: 1) |
| limit | Integer | No | Items per page (default: 10, max: 100) |
| isActive | String | No | Filter by active status ('true' or 'false') |
| approvalStatus | String | No | Filter by approval status ('pending', 'approved', 'rejected') |

### Request Example
```bash
GET /api/vendor/riders/due-amounts?page=1&limit=10&isActive=true&approvalStatus=approved
Headers:
  Authorization: Bearer <vendor_token>
```

### Success Response (200 OK)
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
  "summary": {
    "totalRiders": 5,
    "totalDueAmount": "1500.00"
  },
  "data": [
    {
      "riderId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "fullName": "John Doe",
      "mobileNumber": "9876543210",
      "dueBalance": "500.00",
      "pendingBalance": "200.00",
      "earningWallet": "1000.00",
      "approvalStatus": "approved",
      "isActive": true,
      "assignedToVendorAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "riderId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "fullName": "Jane Smith",
      "mobileNumber": "9876543211",
      "dueBalance": "300.00",
      "pendingBalance": "100.00",
      "earningWallet": "800.00",
      "approvalStatus": "approved",
      "isActive": true,
      "assignedToVendorAt": "2024-01-16T11:20:00.000Z"
    }
  ]
}
```

### Error Responses

**403 Forbidden - Vendor not authenticated**
```json
{
  "success": false,
  "error": "Vendor authentication required"
}
```

**400 Bad Request - Invalid query parameters**
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Page must be a positive integer",
      "param": "page"
    }
  ]
}
```

---

## API 2: Update Rider Due Amount

### Endpoint
```
PUT /api/vendor/riders/:riderId/due-amount
```

### Authentication
- Vendor authentication required (Bearer token)

### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| riderId | String (MongoDB ObjectId) | Yes | Rider's unique ID |

### Request Body
```json
{
  "dueAmount": 750.50,
  "description": "Updated due amount after payment reconciliation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| dueAmount | Number | Yes | New due amount (must be >= 0) |
| description | String | No | Optional description for the transaction (max 500 chars) |

### Request Example
```bash
PUT /api/vendor/riders/65a1b2c3d4e5f6g7h8i9j0k1/due-amount
Headers:
  Authorization: Bearer <vendor_token>
  Content-Type: application/json

Body:
{
  "dueAmount": 750.50,
  "description": "Updated after payment reconciliation"
}
```

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Rider due amount updated successfully",
  "data": {
    "rider": {
      "riderId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "fullName": "John Doe",
      "mobileNumber": "9876543210"
    },
    "dueAmount": {
      "previous": "500.00",
      "new": "750.50",
      "difference": "250.50"
    },
    "updatedAt": "2024-01-20T15:45:00.000Z"
  }
}
```

### Error Responses

**403 Forbidden - Vendor not authenticated**
```json
{
  "success": false,
  "error": "Vendor authentication required"
}
```

**403 Forbidden - Rider not associated with vendor**
```json
{
  "success": false,
  "error": "This rider is not associated with your vendor account"
}
```

**404 Not Found - Rider not found**
```json
{
  "success": false,
  "error": "Rider not found"
}
```

**400 Bad Request - Invalid input**
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Due amount is required",
      "param": "dueAmount"
    },
    {
      "msg": "Due amount must be a number greater than or equal to 0",
      "param": "dueAmount"
    }
  ]
}
```

**400 Bad Request - Invalid rider ID**
```json
{
  "success": false,
  "error": "Invalid rider ID format"
}
```

---

## Usage Examples

### Example 1: Get all active riders with due amounts
```bash
curl -X GET "https://your-api.com/api/vendor/riders/due-amounts?isActive=true&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### Example 2: Get pending approval riders
```bash
curl -X GET "https://your-api.com/api/vendor/riders/due-amounts?approvalStatus=pending" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### Example 3: Update a rider's due amount
```bash
curl -X PUT "https://your-api.com/api/vendor/riders/65a1b2c3d4e5f6g7h8i9j0k1/due-amount" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dueAmount": 1000.00,
    "description": "Monthly payment reconciliation"
  }'
```

### Example 4: Reset rider due amount to zero
```bash
curl -X PUT "https://your-api.com/api/vendor/riders/65a1b2c3d4e5f6g7h8i9j0k1/due-amount" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dueAmount": 0,
    "description": "Payment cleared - all dues settled"
  }'
```

---

## Notes

1. **Authentication**: Dono APIs ko vendor authentication ki zarurat hai. Vendor token header mein pass karna hoga.

2. **Authorization**: Update API automatically check karti hai ki rider uss vendor se associated hai ya nahi.

3. **Transaction History**: Jab bhi due amount update hota hai, ek transaction record rider ke walletTransactions array mein add hota hai.

4. **Validation**: 
   - Due amount negative nahi ho sakta
   - Rider ID valid MongoDB ObjectId hona chahiye
   - Description maximum 500 characters ka ho sakta hai

5. **Pagination**: Get API mein pagination support hai, default 10 items per page.

6. **Summary**: Get API total riders count aur total due amount bhi return karti hai summary mein.
