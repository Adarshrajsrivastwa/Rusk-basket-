# Vendor Profile Update API - JSON Examples

## Endpoint
```
PUT http://localhost:3010/api/vendor/profile
```

## Authentication
Requires vendor authentication token in header:
```
Authorization: Bearer <vendor_jwt_token>
```

## Content-Type
```
Content-Type: multipart/form-data
```
(For file uploads - storeImage)

OR

```
Content-Type: application/json
```
(For JSON-only updates without files)

---

## Example 1: Update Basic Profile Information (JSON)

### Request Body (JSON)
```json
{
  "vendorName": "John Doe",
  "altContactNumber": "9876543210",
  "email": "john.doe@example.com",
  "gender": "male",
  "dateOfBirth": "1990-05-15T00:00:00.000Z"
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorName": "John Doe",
    "altContactNumber": "9876543210",
    "email": "john.doe@example.com",
    "gender": "male",
    "dateOfBirth": "1990-05-15T00:00:00.000Z"
  }'
```

---

## Example 2: Update Store Information (JSON)

### Request Body (JSON)
```json
{
  "storeName": "Doe's Super Store",
  "storeAddressLine1": "123 Main Street",
  "storeAddressLine2": "Near City Park",
  "pinCode": "560001",
  "latitude": 12.9716,
  "longitude": 77.5946
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storeName": "Doe'\''s Super Store",
    "storeAddressLine1": "123 Main Street",
    "storeAddressLine2": "Near City Park",
    "pinCode": "560001",
    "latitude": 12.9716,
    "longitude": 77.5946
  }'
```

---

## Example 3: Update Bank Details (JSON)

### Request Body (JSON)
```json
{
  "ifsc": "HDFC0001234",
  "accountNumber": "123456789012",
  "bankName": "HDFC Bank"
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ifsc": "HDFC0001234",
    "accountNumber": "123456789012",
    "bankName": "HDFC Bank"
  }'
```

---

## Example 4: Update Service Settings (JSON)

### Request Body (JSON)
```json
{
  "serviceRadius": 10.5,
  "handlingChargePercentage": 5.0
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceRadius": 10.5,
    "handlingChargePercentage": 5.0
  }'
```

---

## Example 5: Complete Profile Update (JSON - All Fields)

### Request Body (JSON)
```json
{
  "vendorName": "John Doe",
  "altContactNumber": "9876543210",
  "email": "john.doe@example.com",
  "gender": "male",
  "dateOfBirth": "1990-05-15T00:00:00.000Z",
  "storeName": "Doe's Super Store",
  "storeAddressLine1": "123 Main Street",
  "storeAddressLine2": "Near City Park",
  "pinCode": "560001",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "ifsc": "HDFC0001234",
  "accountNumber": "123456789012",
  "bankName": "HDFC Bank",
  "serviceRadius": 10.5,
  "handlingChargePercentage": 5.0
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorName": "John Doe",
    "altContactNumber": "9876543210",
    "email": "john.doe@example.com",
    "gender": "male",
    "dateOfBirth": "1990-05-15T00:00:00.000Z",
    "storeName": "Doe'\''s Super Store",
    "storeAddressLine1": "123 Main Street",
    "storeAddressLine2": "Near City Park",
    "pinCode": "560001",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "ifsc": "HDFC0001234",
    "accountNumber": "123456789012",
    "bankName": "HDFC Bank",
    "serviceRadius": 10.5,
    "handlingChargePercentage": 5.0
  }'
```

---

## Example 6: Update with Store Image (multipart/form-data)

### Request Body (Form Data)
```
vendorName: John Doe
email: john.doe@example.com
storeName: Doe's Super Store
storeImage: [FILE - image file]
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -F "vendorName=John Doe" \
  -F "email=john.doe@example.com" \
  -F "storeName=Doe's Super Store" \
  -F "storeImage=@/path/to/image.jpg"
```

### JavaScript/Fetch Example
```javascript
const formData = new FormData();
formData.append('vendorName', 'John Doe');
formData.append('email', 'john.doe@example.com');
formData.append('storeName', "Doe's Super Store");
formData.append('storeImage', fileInput.files[0]); // File from input

fetch('http://localhost:3010/api/vendor/profile', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer YOUR_VENDOR_TOKEN'
  },
  body: formData
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

---

## Example 7: Partial Update (Only Update What You Need)

### Request Body (JSON)
```json
{
  "email": "newemail@example.com"
}
```

### cURL Example
```bash
curl -X PUT http://localhost:3010/api/vendor/profile \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

---

## Success Response

### Status Code: 200 OK

```json
{
  "success": true,
  "message": "Vendor profile updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "vendorName": "John Doe",
    "contactNumber": "9876543210",
    "altContactNumber": "9876543210",
    "email": "john.doe@example.com",
    "gender": "male",
    "dateOfBirth": "1990-05-15T00:00:00.000Z",
    "age": 34,
    "storeId": "RB123456",
    "storeName": "Doe's Super Store",
    "storeImage": [
      {
        "url": "https://cloudinary.com/image.jpg",
        "publicId": "rush-basket/store-images/xyz"
      }
    ],
    "storeAddress": {
      "line1": "123 Main Street",
      "line2": "Near City Park",
      "pinCode": "560001",
      "city": "Bangalore",
      "state": "Karnataka",
      "latitude": 12.9716,
      "longitude": 77.5946
    },
    "bankDetails": {
      "ifsc": "HDFC0001234",
      "accountNumber": "123456789012",
      "bankName": "HDFC Bank"
    },
    "serviceRadius": 10.5,
    "handlingChargePercentage": 5.0,
    "permissions": {
      "canManageProducts": true,
      "canManageOrders": true,
      "canManageInventory": true,
      "canViewAnalytics": false,
      "canManageDiscounts": false,
      "canManagePromotions": false,
      "canExportData": false,
      "canManageReviews": false
    },
    "isActive": true,
    "createdBy": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Admin User",
      "email": "admin@example.com"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Error Responses

### 400 Bad Request - Contact Number Update Attempted
```json
{
  "success": false,
  "error": "Contact number cannot be updated through this endpoint"
}
```

### 400 Bad Request - Document Files Upload Attempted
```json
{
  "success": false,
  "error": "Documents cannot be updated through this endpoint. Please contact admin for document updates."
}
```

### 400 Bad Request - Permissions Update Attempted
```json
{
  "success": false,
  "error": "Permissions cannot be updated through this endpoint"
}
```

### 400 Bad Request - Validation Error
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Please provide a valid email",
      "param": "email",
      "location": "body"
    }
  ]
}
```

### 400 Bad Request - Duplicate Email
```json
{
  "success": false,
  "error": "Email already exists"
}
```

### 401 Unauthorized - No Token
```json
{
  "success": false,
  "error": "Not authorized to access this route. Token is required."
}
```

### 401 Unauthorized - Invalid Token
```json
{
  "success": false,
  "error": "Invalid token. Please login again."
}
```

### 403 Forbidden - Not a Vendor
```json
{
  "success": false,
  "error": "Access denied. Vendor privileges required."
}
```

### 404 Not Found - Vendor Not Found
```json
{
  "success": false,
  "error": "Vendor not found"
}
```

---

## Field Validation Rules

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `vendorName` | String | Optional | Not empty if provided | Trimmed |
| `altContactNumber` | String | Optional | 10 digits | Format: `^[0-9]{10}$` |
| `email` | String | Optional | Valid email format | Trimmed, lowercase |
| `gender` | String | Optional | One of: `male`, `female`, `other` | - |
| `dateOfBirth` | Date | Optional | ISO 8601 format | Example: `1990-05-15T00:00:00.000Z` |
| `storeName` | String | Optional | Not empty if provided | Trimmed |
| `storeAddressLine1` | String | Optional | Not empty if provided | Trimmed |
| `storeAddressLine2` | String | Optional | - | Trimmed |
| `pinCode` | String | Optional | 6 digits | Format: `^[0-9]{6}$` |
| `latitude` | Number | Optional | Valid float | - |
| `longitude` | Number | Optional | Valid float | - |
| `ifsc` | String | Optional | Valid IFSC format | Format: `^[A-Z]{4}0[A-Z0-9]{6}$` |
| `accountNumber` | String | Optional | Not empty if provided | Trimmed |
| `bankName` | String | Optional | Not empty if provided | Trimmed |
| `serviceRadius` | Number | Optional | Min: 0.1 | In kilometers |
| `handlingChargePercentage` | Number | Optional | Min: 0, Max: 100 | Percentage |
| `storeImage` | File | Optional | Image file | Only image files allowed |
| `contactNumber` | String | ❌ Blocked | - | Cannot be updated |
| `permissions` | Object | ❌ Blocked | - | Cannot be updated |
| `panCardFront` | File | ❌ Blocked | - | Cannot be updated |
| `panCardBack` | File | ❌ Blocked | - | Cannot be updated |
| `aadharCardFront` | File | ❌ Blocked | - | Cannot be updated |
| `aadharCardBack` | File | ❌ Blocked | - | Cannot be updated |
| `drivingLicense` | File | ❌ Blocked | - | Cannot be updated |
| `cancelCheque` | File | ❌ Blocked | - | Cannot be updated |

---

## Important Notes

1. **All fields are optional** - You can update only the fields you want to change
2. **Contact number cannot be updated** - This is a security measure
3. **Documents cannot be updated** - Contact admin for document updates
4. **Permissions cannot be updated** - Only admin can update permissions
5. **Email uniqueness** - If updating email, it must be unique across all vendors
6. **PIN code validation** - When updating PIN code, city and state are automatically fetched
7. **File uploads** - Use `multipart/form-data` when uploading store images
8. **Authentication required** - Must include valid vendor JWT token in Authorization header

---

## Testing with Postman

1. **Method**: PUT
2. **URL**: `http://localhost:3010/api/vendor/profile`
3. **Headers**:
   - `Authorization`: `Bearer YOUR_VENDOR_TOKEN`
   - `Content-Type`: `application/json` (for JSON) or leave empty (for form-data)
4. **Body**:
   - For JSON: Select "raw" → "JSON" and paste JSON
   - For files: Select "form-data" → Add fields and files

---

## Testing with JavaScript (Fetch API)

### JSON Update
```javascript
const updateVendorProfile = async (token, data) => {
  const response = await fetch('http://localhost:3010/api/vendor/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  return await response.json();
};

// Usage
const data = {
  vendorName: 'John Doe',
  email: 'john.doe@example.com',
  storeName: "Doe's Super Store"
};

updateVendorProfile('YOUR_TOKEN', data)
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### File Upload Update
```javascript
const updateVendorProfileWithImage = async (token, data, imageFile) => {
  const formData = new FormData();
  
  // Add text fields
  Object.keys(data).forEach(key => {
    formData.append(key, data[key]);
  });
  
  // Add image file
  if (imageFile) {
    formData.append('storeImage', imageFile);
  }
  
  const response = await fetch('http://localhost:3010/api/vendor/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`
      // Don't set Content-Type for FormData, browser will set it automatically
    },
    body: formData
  });
  
  return await response.json();
};

// Usage
const fileInput = document.querySelector('input[type="file"]');
const data = {
  vendorName: 'John Doe',
  storeName: "Doe's Super Store"
};

updateVendorProfileWithImage('YOUR_TOKEN', data, fileInput.files[0])
  .then(result => console.log(result))
  .catch(error => console.error(error));
```
