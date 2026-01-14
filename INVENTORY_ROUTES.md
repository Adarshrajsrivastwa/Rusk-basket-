# Inventory Management Routes for Vendors

This document provides complete details of all inventory management routes available for vendors.

## Base URL
All inventory routes are prefixed with `/api/vendor/inventory`

---

## 🔵 VENDOR INVENTORY ROUTES

All routes require **Vendor Authentication** (Bearer token or cookie).

### 1. Get All Products Inventory
**Endpoint:** `GET /api/vendor/inventory`

**Authentication:** Required (Vendor)

**Query Parameters:**
- `page` (optional): Page number for pagination
  - Default: `1`
  - Must be a positive integer
- `limit` (optional): Number of products per page
  - Default: `20`
  - Range: 1-100
- `search` (optional): Search term for product name
  - Max length: 200 characters
  - Case-insensitive search

**Example Request:**
```
GET /api/vendor/inventory?page=1&limit=20&search=laptop
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "productId": "507f1f77bcf86cd799439011",
        "productName": "Product Name",
        "inventory": 100,
        "skus": [
          {
            "sku": "SKU001",
            "inventory": 50
          },
          {
            "sku": "SKU002",
            "inventory": 50
          }
        ],
        "totalSkuInventory": 100,
        "approvalStatus": "approved",
        "isActive": true
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalProducts": 100,
      "limit": 20
    }
  }
}
```

---

### 2. Get Single Product Inventory
**Endpoint:** `GET /api/vendor/inventory/:id`

**Authentication:** Required (Vendor)

**URL Parameters:**
- `id` (required): Product ID (MongoDB ObjectId)

**Example Request:**
```
GET /api/vendor/inventory/507f1f77bcf86cd799439011
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "507f1f77bcf86cd799439011",
    "productName": "Product Name",
    "inventory": 100,
    "skus": [
      {
        "sku": "SKU001",
        "inventory": 50
      },
      {
        "sku": "SKU002",
        "inventory": 50
      }
    ],
    "totalSkuInventory": 100
  }
}
```

---

### 3. Update Product Inventory
**Endpoint:** `PUT /api/vendor/inventory/:id`

**Authentication:** Required (Vendor)

**URL Parameters:**
- `id` (required): Product ID (MongoDB ObjectId)

**Request Body:**
You can update inventory in two ways:

#### Option 1: Simple Inventory Update
```json
{
  "inventory": 150,
  "action": "set"  // Optional: "set" (default), "add", or "subtract"
}
```

#### Option 2: SKU-based Inventory Update
```json
{
  "skus": [
    {
      "sku": "SKU001",
      "inventory": 75
    },
    {
      "sku": "SKU002",
      "inventory": 75
    }
  ],
  "action": "set"  // Optional: "set" (default), "add", or "subtract"
}
```

**Action Types:**
- `set` (default): Set inventory to the specified value
- `add`: Add the specified amount to current inventory
- `subtract`: Subtract the specified amount from current inventory

**Example Requests:**

1. **Set inventory directly:**
```json
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
{
  "inventory": 200
}
```

2. **Add to inventory:**
```json
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
{
  "inventory": 50,
  "action": "add"
}
```

3. **Subtract from inventory:**
```json
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
{
  "inventory": 25,
  "action": "subtract"
}
```

4. **Update SKU inventory (add):**
```json
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
{
  "skus": [
    {
      "sku": "SKU001",
      "inventory": 10
    }
  ],
  "action": "add"
}
```

5. **Update SKU inventory (set):**
```json
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
{
  "skus": [
    {
      "sku": "SKU001",
      "inventory": 100
    },
    {
      "sku": "SKU002",
      "inventory": 100
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Inventory updated successfully",
  "data": {
    "product": {
      "_id": "507f1f77bcf86cd799439011",
      "productName": "Product Name",
      "inventory": 200,
      "category": {
        "name": "Category Name"
      },
      "subCategory": {
        "name": "SubCategory Name"
      },
      "vendor": {
        "vendorName": "Vendor Name",
        "storeName": "Store Name"
      }
    },
    "inventory": {
      "previous": 150,
      "current": 200,
      "change": 50
    },
    "skus": [
      {
        "sku": "SKU001",
        "inventory": 100
      },
      {
        "sku": "SKU002",
        "inventory": 100
      }
    ]
  }
}
```

---

## 🔐 Authentication

All routes require vendor authentication:
- Use `protectVendor` middleware
- Token must have `role: 'vendor'`
- Vendor must be active

**Authentication Methods:**
1. **Bearer Token:** `Authorization: Bearer <token>`
2. **Cookie:** `token=<token>` in cookies

---

## 📋 Validation Rules

### Inventory Update
- `inventory`: Must be a number ≥ 0
- `action`: Must be one of: `add`, `subtract`, `set` (default: `set`)
- `skus`: Must be an array if provided
- `skus[].sku`: Must be a non-empty string
- `skus[].inventory`: Must be a number ≥ 0
- Either `inventory` or `skus` must be provided

### Query Parameters
- `page`: Must be a positive integer
- `limit`: Must be between 1 and 100
- `search`: Max 200 characters

---

## ⚠️ Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Inventory must be a number greater than or equal to 0",
      "param": "inventory",
      "location": "body"
    }
  ]
}
```

### Product Not Found (404)
```json
{
  "success": false,
  "error": "Product not found"
}
```

### Unauthorized Access (403)
```json
{
  "success": false,
  "error": "You can only update inventory for your own products"
}
```

### Insufficient Inventory (400)
```json
{
  "success": false,
  "error": "Cannot subtract 50. Current inventory: 30"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to update inventory"
}
```

---

## 📝 Important Notes

1. **Inventory Updates Don't Require Re-approval**
   - Unlike general product updates, inventory changes do not reset the product's approval status
   - Products remain approved after inventory updates

2. **SKU vs Simple Inventory**
   - If a product has SKUs, the total inventory is calculated from SKU inventories
   - When updating SKUs, the main inventory field is automatically recalculated
   - You can use either simple inventory or SKU-based inventory, but not both in the same request

3. **Action Behavior**
   - `set`: Replaces current inventory with the new value
   - `add`: Adds the specified amount to current inventory
   - `subtract`: Subtracts the specified amount (prevents negative inventory)

4. **Vendor Ownership**
   - Vendors can only view and update inventory for their own products
   - Attempting to access another vendor's product will return a 403 error

5. **Inventory Tracking**
   - The response includes previous and current inventory values
   - Change amount is calculated and returned in the response

---

## 🚀 Quick Reference

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/vendor/inventory` | GET | Vendor | Get all products inventory (paginated) |
| `/api/vendor/inventory/:id` | GET | Vendor | Get single product inventory |
| `/api/vendor/inventory/:id` | PUT | Vendor | Update product inventory |

---

## 💡 Usage Examples

### Example 1: Fill Inventory (Add Stock)
```bash
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
Authorization: Bearer <vendor_token>

{
  "inventory": 100,
  "action": "add"
}
```

### Example 2: Set Exact Inventory
```bash
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
Authorization: Bearer <vendor_token>

{
  "inventory": 200
}
```

### Example 3: Update Multiple SKUs
```bash
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
Authorization: Bearer <vendor_token>

{
  "skus": [
    { "sku": "SKU001", "inventory": 50 },
    { "sku": "SKU002", "inventory": 75 },
    { "sku": "SKU003", "inventory": 25 }
  ]
}
```

### Example 4: Add Inventory to Specific SKU
```bash
PUT /api/vendor/inventory/507f1f77bcf86cd799439011
Authorization: Bearer <vendor_token>

{
  "skus": [
    { "sku": "SKU001", "inventory": 10 }
  ],
  "action": "add"
}
```
