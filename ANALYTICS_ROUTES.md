# Analytics Routes Documentation

This document provides complete details of all analytics routes available for vendors and admins.

## Base URL
All analytics routes are prefixed with `/api/analytics`

---

## 🔵 VENDOR ROUTES

All vendor routes require **Vendor Authentication** (Bearer token or cookie).

### 1. Get Vendor Dashboard Analytics
**Endpoint:** `GET /api/analytics/vendor/dashboard`

**Authentication:** Required (Vendor)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`

**Example Request:**
```
GET /api/analytics/vendor/dashboard?period=month
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-02-01T00:00:00.000Z"
    },
    "revenue": {
      "total": 50000,
      "totalOrders": 150,
      "averageOrderValue": 333.33,
      "allTimeTotal": 200000,
      "allTimeTotalOrders": 600,
      "totalItemRevenue": 48000,
      "totalItemsSold": 450,
      "totalCashback": 500
    },
    "orders": {
      "statusDistribution": [
        {
          "status": "delivered",
          "count": 120,
          "revenue": 40000
        },
        {
          "status": "pending",
          "count": 10,
          "revenue": 3000
        }
      ],
      "paymentMethodDistribution": [
        {
          "method": "cod",
          "count": 80,
          "revenue": 25000
        },
        {
          "method": "prepaid",
          "count": 70,
          "revenue": 25000
        }
      ]
    },
    "products": {
      "total": 50,
      "approved": 45,
      "pending": 5
    },
    "topProducts": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "productName": "Product Name",
        "totalQuantity": 100,
        "totalRevenue": 10000,
        "orderCount": 50
      }
    ],
    "revenueByDate": [
      {
        "date": "2024-01-01",
        "revenue": 2000,
        "orders": 5
      }
    ]
  }
}
```

---

### 2. Get Vendor Sales Analytics
**Endpoint:** `GET /api/analytics/vendor/sales`

**Authentication:** Required (Vendor)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`
- `groupBy` (optional): Grouping for sales data
  - Values: `day`, `week`, `month`
  - Default: `day`

**Example Request:**
```
GET /api/analytics/vendor/sales?period=month&groupBy=day
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "groupBy": "day",
    "sales": [
      {
        "period": "2024-01-01",
        "revenue": 2000,
        "orders": 5,
        "itemsSold": 20
      },
      {
        "period": "2024-01-02",
        "revenue": 3000,
        "orders": 8,
        "itemsSold": 30
      }
    ]
  }
}
```

---

### 3. Get Vendor Product Performance
**Endpoint:** `GET /api/analytics/vendor/products`

**Authentication:** Required (Vendor)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`
- `limit` (optional): Number of top products to return
  - Values: 1-100
  - Default: 20

**Example Request:**
```
GET /api/analytics/vendor/products?period=month&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "products": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "productName": "Product Name",
        "thumbnail": {
          "url": "https://example.com/image.jpg",
          "publicId": "image_id"
        },
        "approvalStatus": "approved",
        "isActive": true,
        "metrics": {
          "totalQuantity": 100,
          "totalRevenue": 10000,
          "averagePrice": 100,
          "orderCount": 50,
          "totalCashback": 100
        }
      }
    ]
  }
}
```

---

## 🔴 ADMIN ROUTES

All admin routes require **Admin Authentication** (Bearer token or cookie).

### 4. Get Admin Dashboard Analytics
**Endpoint:** `GET /api/analytics/admin/dashboard`

**Authentication:** Required (Admin)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`

**Example Request:**
```
GET /api/analytics/admin/dashboard?period=month
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-02-01T00:00:00.000Z"
    },
    "revenue": {
      "total": 500000,
      "totalOrders": 1500,
      "averageOrderValue": 333.33,
      "totalDiscount": 50000,
      "totalTax": 25000,
      "totalShipping": 15000
    },
    "orders": {
      "statusDistribution": [
        {
          "status": "delivered",
          "count": 1200,
          "revenue": 400000
        }
      ],
      "paymentMethodDistribution": [
        {
          "method": "cod",
          "count": 800,
          "revenue": 250000
        }
      ]
    },
    "users": {
      "total": 5000,
      "active": 4500,
      "new": 200
    },
    "vendors": {
      "total": 100,
      "active": 90,
      "new": 5,
      "topVendors": [
        {
          "vendorId": "507f1f77bcf86cd799439011",
          "vendorName": "Vendor Name",
          "storeName": "Store Name",
          "contactNumber": "1234567890",
          "isActive": true,
          "totalRevenue": 50000,
          "totalOrders": 150,
          "totalItems": 450
        }
      ]
    },
    "products": {
      "total": 1000,
      "active": 900,
      "approved": 850,
      "pending": 50,
      "topProducts": [
        {
          "productId": "507f1f77bcf86cd799439011",
          "productName": "Product Name",
          "totalQuantity": 1000,
          "totalRevenue": 100000,
          "orderCount": 500
        }
      ]
    },
    "revenueByDate": [
      {
        "date": "2024-01-01",
        "revenue": 20000,
        "orders": 50
      }
    ]
  }
}
```

---

### 5. Get Admin Sales Analytics
**Endpoint:** `GET /api/analytics/admin/sales`

**Authentication:** Required (Admin)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`
- `groupBy` (optional): Grouping for sales data
  - Values: `day`, `week`, `month`
  - Default: `day`
- `vendorId` (optional): Filter by specific vendor (MongoDB ObjectId)
  - If provided, shows sales for that vendor only

**Example Request:**
```
GET /api/analytics/admin/sales?period=month&groupBy=day&vendorId=507f1f77bcf86cd799439011
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "groupBy": "day",
    "vendorId": "507f1f77bcf86cd799439011",
    "sales": [
      {
        "period": "2024-01-01",
        "revenue": 20000,
        "orders": 50,
        "itemsSold": 200,
        "averageOrderValue": 400
      }
    ]
  }
}
```

---

### 6. Get Admin Vendor Analytics
**Endpoint:** `GET /api/analytics/admin/vendors`

**Authentication:** Required (Admin)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`
- `limit` (optional): Number of top vendors to return
  - Values: 1-100
  - Default: 20

**Example Request:**
```
GET /api/analytics/admin/vendors?period=month&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "vendors": [
      {
        "vendorId": "507f1f77bcf86cd799439011",
        "vendorName": "Vendor Name",
        "storeName": "Store Name",
        "contactNumber": "1234567890",
        "email": "vendor@example.com",
        "isActive": true,
        "metrics": {
          "totalRevenue": 50000,
          "totalOrders": 150,
          "totalItems": 450,
          "averageOrderValue": 333.33
        }
      }
    ]
  }
}
```

---

### 7. Get Admin Product Analytics
**Endpoint:** `GET /api/analytics/admin/products`

**Authentication:** Required (Admin)

**Query Parameters:**
- `period` (optional): Time period for analytics
  - Values: `today`, `week`, `month`, `year`, `all`
  - Default: `month`
- `limit` (optional): Number of top products to return
  - Values: 1-100
  - Default: 20

**Example Request:**
```
GET /api/analytics/admin/products?period=month&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "products": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "productName": "Product Name",
        "thumbnail": {
          "url": "https://example.com/image.jpg",
          "publicId": "image_id"
        },
        "vendor": {
          "_id": "507f1f77bcf86cd799439012",
          "vendorName": "Vendor Name",
          "storeName": "Store Name"
        },
        "approvalStatus": "approved",
        "isActive": true,
        "metrics": {
          "totalQuantity": 1000,
          "totalRevenue": 100000,
          "averagePrice": 100,
          "orderCount": 500,
          "totalCashback": 1000
        }
      }
    ]
  }
}
```

---

## 🔐 Authentication

All routes require authentication:

### Vendor Routes
- Use `protectVendor` middleware
- Token must have `role: 'vendor'`
- Vendor must be active

### Admin Routes
- Use `protect` middleware (admin auth)
- Token must have `role: 'admin'`
- Admin must be active

**Authentication Methods:**
1. **Bearer Token:** `Authorization: Bearer <token>`
2. **Cookie:** `token=<token>` in cookies

---

## 📊 Period Options

All routes support the following period values:
- `today` - Data from today only
- `week` - Data from last 7 days
- `month` - Data from last 30 days (default)
- `year` - Data from last 365 days
- `all` - All-time data

---

## ⚠️ Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Period must be one of: today, week, month, year, all",
      "param": "period",
      "location": "query"
    }
  ]
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": "Not authorized to access this route. Token is required."
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to fetch vendor analytics"
}
```

---

## 📝 Notes

1. All revenue values are in the base currency unit (e.g., rupees, dollars)
2. Dates are returned in ISO 8601 format
3. All counts are integers
4. Revenue calculations exclude cancelled and refunded orders
5. Vendor routes only show data for the authenticated vendor
6. Admin routes show platform-wide data
7. The `vendorId` parameter in admin sales route allows filtering by specific vendor

---

## 🚀 Quick Reference

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/analytics/vendor/dashboard` | GET | Vendor | Vendor dashboard overview |
| `/api/analytics/vendor/sales` | GET | Vendor | Vendor sales analytics |
| `/api/analytics/vendor/products` | GET | Vendor | Vendor product performance |
| `/api/analytics/admin/dashboard` | GET | Admin | Admin dashboard overview |
| `/api/analytics/admin/sales` | GET | Admin | Admin sales analytics |
| `/api/analytics/admin/vendors` | GET | Admin | Vendor performance analytics |
| `/api/analytics/admin/products` | GET | Admin | Product performance analytics |
