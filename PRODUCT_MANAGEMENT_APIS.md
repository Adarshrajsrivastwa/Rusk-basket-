# Product Management APIs

This document provides a comprehensive overview of all Product Management APIs including View Product, Edit Product, and Change Status endpoints.

## Table of Contents
1. [View Product APIs](#view-product-apis)
2. [Edit Product APIs](#edit-product-apis)
3. [Change Status APIs](#change-status-apis)

---

## View Product APIs

### 1. Get Vendor Products (Vendor Only)
**Endpoint:** `GET /api/vendor/products`  
**Authentication:** Vendor Token Required  
**Description:** Get all products for the authenticated vendor (regardless of approvalStatus or isActive status)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `category` (optional): Filter by category ID
- `subCategory` (optional): Filter by subCategory ID
- `search` (optional): Search by product name

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "pages": 5
  },
  "data": [
    {
      "_id": "product_id",
      "productName": "Product Name",
      "categoryName": "Category",
      "subCategoryName": "SubCategory",
      "vendorName": "Vendor Name",
      "date": "DD/MM/YYYY",
      "sellPrice": 100,
      "status": "pending|approved|rejected",
      ...
    }
  ]
}
```

---

### 2. Get Single Product by ID (Public)
**Endpoint:** `GET /api/product/:id`  
**Authentication:** None (Public)  
**Description:** Get a single product by ID. Only returns approved and active products for public access.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "product_id",
    "productName": "Product Name",
    "vendor": {...},
    "category": {...},
    "subCategory": {...},
    ...
  }
}
```

---

### 3. Get All Products (Admin Only)
**Endpoint:** `GET /api/product/all`  
**Authentication:** Admin Token Required  
**Description:** Get all products with full details (regardless of approvalStatus or isActive status)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `vendor` (optional): Filter by vendor ID
- `category` (optional): Filter by category ID
- `subCategory` (optional): Filter by subCategory ID
- `approvalStatus` (optional): Filter by status (`pending`, `approved`, `rejected`)
- `isActive` (optional): Filter by active status (boolean)
- `search` (optional): Search by product name

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  },
  "data": [...]
}
```

---

### 4. Get All Products List - Simplified (Admin Only)
**Endpoint:** `GET /api/product/admin/list`  
**Authentication:** Admin Token Required  
**Description:** Get all products with simplified view (only essential fields)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `vendor` (optional): Filter by vendor ID
- `category` (optional): Filter by category ID
- `subCategory` (optional): Filter by subCategory ID
- `approvalStatus` (optional): Filter by status (`pending`, `approved`, `rejected`)
- `isActive` (optional): Filter by active status (boolean)
- `search` (optional): Search by product name

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  },
  "data": [
    {
      "_id": "product_id",
      "productId": "product_id",
      "date": "DD/MM/YYYY",
      "vendor": "Vendor Name",
      "category": "Category Name",
      "subCategory": "SubCategory Name",
      "salePrice": 100,
      "status": "pending|approved|rejected"
    }
  ]
}
```

---

### 5. Get Pending Products (Admin Only)
**Endpoint:** `GET /api/product/pending`  
**Authentication:** Admin Token Required  
**Description:** Get all products with `approvalStatus: 'pending'`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `vendor` (optional): Filter by vendor ID
- `category` (optional): Filter by category ID
- `subCategory` (optional): Filter by subCategory ID
- `isActive` (optional): Filter by active status (boolean)
- `search` (optional): Search by product name

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 20,
    "pages": 2
  },
  "data": [...]
}
```

---

### 6. Get Nearby Products (Public)
**Endpoint:** `GET /api/product/`  
**Authentication:** None (Public)  
**Description:** Get approved and active products with optional location filtering

**Query Parameters:**
- `latitude` (optional): User latitude (-90 to 90)
- `longitude` (optional): User longitude (-180 to 180)
- `radius` (optional): Search radius in km (default: 10, max: 100)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `category` (optional): Filter by category ID
- `subCategory` (optional): Filter by subCategory ID
- `search` (optional): Search by product name

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  },
  "filters": {...},
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radius": 10
  },
  "data": [...]
}
```

---

### 7. Search Products by Name and Location (Public)
**Endpoint:** `GET /api/product/search`  
**Authentication:** None (Public)  
**Description:** Search for products by name with location filtering

**Query Parameters:**
- `latitude` (required): User latitude (-90 to 90)
- `longitude` (required): User longitude (-180 to 180)
- `search` (required): Search term (1-200 characters)
- `radius` (optional): Search radius in km (default: 10, max: 100)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 30,
    "pages": 2
  },
  "search": "search term",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radius": 10
  },
  "data": [...]
}
```

---

## Edit Product APIs

### 1. Update Product (Vendor Only)
**Endpoint:** `PUT /api/product/update/:id`  
**Authentication:** Vendor Token Required  
**Description:** Update product. Vendor can only update their own products. Updates reset approvalStatus to 'pending'.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Request Body (All fields optional):**
```json
{
  "productName": "Updated Product Name",
  "productType": "quantity|weight|volume",
  "productTypeValue": 1.5,
  "productTypeUnit": "kg",
  "category": "category_id",
  "subCategory": "subcategory_id",
  "description": "Product description",
  "skuHsn": "SKU123",
  "inventory": 100,
  "skus": [
    {
      "sku": "SKU001",
      "inventory": 50
    }
  ],
  "actualPrice": 100,
  "regularPrice": 120,
  "salePrice": 100,
  "cashback": 5,
  "tax": 18,
  "tags": "tag1,tag2,tag3",
  "latitude": 12.9716,
  "longitude": 77.5946
}
```

**File Uploads (multipart/form-data):**
- `thumbnail`: Product thumbnail image
- `images[]`: Product images (multiple files)

**Response:**
```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "_id": "product_id",
    "productName": "Updated Product Name",
    "discountPercentage": 16.67,
    ...
  }
}
```

**Note:** When vendor updates product, `approvalStatus` is reset to `'pending'` for re-approval.

---

### 2. Update Product (Admin Only)
**Endpoint:** `PUT /api/product/admin/:id`  
**Authentication:** Admin Token Required  
**Description:** Admin can update any product. Updates reset approvalStatus to 'pending'.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Request Body:** Same as vendor update endpoint

**File Uploads (multipart/form-data):**
- `thumbnail`: Product thumbnail image
- `images[]`: Product images (multiple files)

**Response:**
```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {...}
}
```

**Note:** When admin updates product, `approvalStatus` is reset to `'pending'` for re-approval.

---

### 3. Delete Product (Vendor Only)
**Endpoint:** `DELETE /api/product/vendor/:id`  
**Authentication:** Vendor Token Required  
**Description:** Delete product. Vendor can only delete their own products.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Response:**
```json
{
  "success": true,
  "message": "Product deleted successfully",
  "data": {
    "productId": "product_id",
    "productName": "Product Name"
  }
}
```

---

### 4. Delete Product (Admin Only)
**Endpoint:** `DELETE /api/product/admin/:id`  
**Authentication:** Admin Token Required  
**Description:** Admin can delete any product.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Response:**
```json
{
  "success": true,
  "message": "Product deleted successfully",
  "data": {
    "productId": "product_id",
    "productName": "Product Name"
  }
}
```

---

## Change Status APIs

### 1. Approve Product (Admin Only)
**Endpoint:** `PUT /api/product/approve/:id`  
**Authentication:** Admin Token Required  
**Description:** Approve a product. Changes `approvalStatus` to `'approved'`.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Response:**
```json
{
  "success": true,
  "message": "Product approved successfully",
  "data": {
    "_id": "product_id",
    "productName": "Product Name",
    "approvalStatus": "approved",
    "approvedBy": {...},
    "approvedAt": "2024-01-01T00:00:00.000Z",
    ...
  }
}
```

---

### 2. Reject Product (Admin Only)
**Endpoint:** `PUT /api/product/reject/:id`  
**Authentication:** Admin Token Required  
**Description:** Reject a product. Changes `approvalStatus` to `'rejected'`.

**URL Parameters:**
- `id`: Product ID (MongoDB ObjectId)

**Request Body:**
```json
{
  "rejectionReason": "Reason for rejection (optional, max 500 characters)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Product rejected successfully",
  "data": {
    "_id": "product_id",
    "productName": "Product Name",
    "approvalStatus": "rejected",
    "rejectionReason": "Reason for rejection",
    ...
  }
}
```

---

### 3. Toggle Product Active Status (via Update)
**Note:** There is no dedicated toggle endpoint for `isActive` status. However, you can update the `isActive` field through the update endpoints:

**For Vendor:**
- Use `PUT /api/product/update/:id` with `isActive: true|false` in request body

**For Admin:**
- Use `PUT /api/product/admin/:id` with `isActive: true|false` in request body

**Request Body:**
```json
{
  "isActive": false
}
```

**Note:** Currently, the update endpoints don't explicitly validate `isActive` in the validation rules, but the field can be set directly on the product model. You may need to add this field to the update validation if it's not already supported.

---

## Product Status Fields

### approvalStatus
- **Values:** `'pending'`, `'approved'`, `'rejected'`
- **Default:** `'pending'`
- **Changed by:** Admin via approve/reject endpoints
- **Auto-reset:** Set to `'pending'` when product is updated

### isActive
- **Values:** `true`, `false`
- **Default:** `true`
- **Changed by:** Update endpoints (vendor/admin)
- **Purpose:** Controls product visibility in public listings

---

## Additional Product Management Features

### Product Offers
Products can have special offers managed through separate endpoints:

- `PUT /api/vendor/products/:productId/offer` - Toggle/Update product offer
- `GET /api/vendor/products/offers` - Get vendor offers
- `GET /api/vendor/products/:productId/offer` - Get product offer

### Inventory Management
Products have inventory management through vendor inventory endpoints:

- `GET /api/vendor/inventory` - Get all inventory
- `GET /api/vendor/inventory/:id` - Get specific product inventory
- `PUT /api/vendor/inventory/:id` - Update inventory

---

## Notes

1. **Approval Workflow:**
   - Products are created with `approvalStatus: 'pending'`
   - Admin must approve/reject products
   - When product is updated, `approvalStatus` resets to `'pending'`

2. **Product Visibility:**
   - Public endpoints only show products with `approvalStatus: 'approved'` AND `isActive: true`
   - Vendor endpoints show all products regardless of status
   - Admin endpoints show all products with filtering options

3. **File Uploads:**
   - Thumbnail and images are uploaded to Cloudinary
   - Old images are deleted when new ones are uploaded
   - Supports both images and videos

4. **SKUs:**
   - Products can have multiple SKUs with individual inventory
   - Total inventory is sum of all SKU inventories
   - Can be updated via `skus` array in update request
