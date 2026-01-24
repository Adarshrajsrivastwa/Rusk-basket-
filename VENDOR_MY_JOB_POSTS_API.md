# Vendor My Job Posts API Documentation

## Endpoint
```
GET http://localhost:3010/api/vendor/my-job-posts
```

## Description
Get all job posts created by the authenticated vendor. The vendor ID is automatically extracted from the JWT token, so vendors can only see their own job posts.

---

## Authentication
**Required**: Vendor JWT Token

**Header**:
```
Authorization: Bearer <vendor_jwt_token>
```

---

## Query Parameters

All parameters are **optional**.

| Parameter | Type | Validation | Description | Example |
|-----------|------|------------|-------------|---------|
| `page` | Integer | min: 1 | Page number for pagination | `?page=1` |
| `limit` | Integer | min: 1, max: 100 | Number of items per page | `?limit=10` |
| `isActive` | String | "true" or "false" | Filter by active status | `?isActive=true` |
| `search` | String | max: 200 chars | Search in job title (case-insensitive) | `?search=delivery` |
| `city` | String | max: 100 chars | Filter by city (case-insensitive) | `?city=Bangalore` |
| `state` | String | max: 100 chars | Filter by state (case-insensitive) | `?state=Karnataka` |
| `pinCode` | String | 6 digits | Filter by PIN code | `?pinCode=560001` |

---

## Request Examples

### 1. Get All Job Posts (Basic)
```bash
curl -X GET http://localhost:3010/api/vendor/my-job-posts \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 2. With Pagination
```bash
curl -X GET "http://localhost:3010/api/vendor/my-job-posts?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 3. Get Only Active Job Posts
```bash
curl -X GET "http://localhost:3010/api/vendor/my-job-posts?isActive=true" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 4. Search by Job Title
```bash
curl -X GET "http://localhost:3010/api/vendor/my-job-posts?search=rider" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 5. Filter by Location
```bash
curl -X GET "http://localhost:3010/api/vendor/my-job-posts?city=Bangalore&state=Karnataka" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 6. Combined Filters
```bash
curl -X GET "http://localhost:3010/api/vendor/my-job-posts?page=1&limit=10&isActive=true&search=delivery&city=Bangalore" \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN"
```

### 7. JavaScript/Fetch Example
```javascript
const getMyJobPosts = async (token, filters = {}) => {
  const queryParams = new URLSearchParams();
  
  if (filters.page) queryParams.append('page', filters.page);
  if (filters.limit) queryParams.append('limit', filters.limit);
  if (filters.isActive !== undefined) queryParams.append('isActive', filters.isActive);
  if (filters.search) queryParams.append('search', filters.search);
  if (filters.city) queryParams.append('city', filters.city);
  if (filters.state) queryParams.append('state', filters.state);
  if (filters.pinCode) queryParams.append('pinCode', filters.pinCode);
  
  const url = `http://localhost:3010/api/vendor/my-job-posts${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};

// Usage
getMyJobPosts('YOUR_TOKEN', {
  page: 1,
  limit: 10,
  isActive: 'true',
  search: 'delivery'
})
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### 8. Axios Example
```javascript
const axios = require('axios');

const getMyJobPosts = async (token, filters = {}) => {
  try {
    const response = await axios.get('http://localhost:3010/api/vendor/my-job-posts', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: filters
    });
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};

// Usage
getMyJobPosts('YOUR_TOKEN', {
  page: 1,
  limit: 10,
  isActive: 'true'
})
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

---

## Success Response (200 OK)

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
      "_id": "507f1f77bcf86cd799439011",
      "jobTitle": "Delivery Rider Required",
      "joiningBonus": 5000,
      "onboardingFee": 1000,
      "vendor": {
        "_id": "507f1f77bcf86cd799439012",
        "vendorName": "John Doe",
        "storeName": "Doe's Super Store",
        "contactNumber": "9876543210",
        "email": "john.doe@example.com"
      },
      "location": {
        "line1": "123 Main Street",
        "line2": "Near City Park",
        "pinCode": "560001",
        "city": "Bangalore",
        "state": "Karnataka",
        "latitude": 12.9716,
        "longitude": 77.5946
      },
      "isActive": true,
      "postedBy": {
        "_id": "507f1f77bcf86cd799439012",
        "vendorName": "John Doe",
        "storeName": "Doe's Super Store",
        "contactNumber": "9876543210"
      },
      "postedByType": "Vendor",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439013",
      "jobTitle": "Part-time Delivery Rider",
      "joiningBonus": 3000,
      "onboardingFee": 500,
      "vendor": {
        "_id": "507f1f77bcf86cd799439012",
        "vendorName": "John Doe",
        "storeName": "Doe's Super Store",
        "contactNumber": "9876543210",
        "email": "john.doe@example.com"
      },
      "location": {
        "line1": "456 Second Street",
        "line2": "",
        "pinCode": "560002",
        "city": "Bangalore",
        "state": "Karnataka",
        "latitude": 12.9352,
        "longitude": 77.6245
      },
      "isActive": false,
      "postedBy": {
        "_id": "507f1f77bcf86cd799439012",
        "vendorName": "John Doe",
        "storeName": "Doe's Super Store",
        "contactNumber": "9876543210"
      },
      "postedByType": "Vendor",
      "createdAt": "2024-01-10T08:20:00.000Z",
      "updatedAt": "2024-01-12T14:15:00.000Z"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | Boolean | Request success status |
| `count` | Integer | Number of items in current page |
| `pagination` | Object | Pagination information |
| `pagination.page` | Integer | Current page number |
| `pagination.limit` | Integer | Items per page |
| `pagination.total` | Integer | Total number of job posts |
| `pagination.pages` | Integer | Total number of pages |
| `data` | Array | Array of job post objects |

### Job Post Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `_id` | String | Job post ID |
| `jobTitle` | String | Job title |
| `joiningBonus` | Number | Joining bonus amount |
| `onboardingFee` | Number | Onboarding fee amount |
| `vendor` | Object | Vendor information (populated) |
| `location` | Object | Job location details |
| `isActive` | Boolean | Active status |
| `postedBy` | Object | Who posted the job (populated) |
| `postedByType` | String | Type of poster ("Vendor" or "Admin") |
| `createdAt` | Date | Creation timestamp |
| `updatedAt` | Date | Last update timestamp |

---

## Error Responses

### 400 Bad Request - Invalid Query Parameter
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Page must be a positive integer",
      "param": "page",
      "location": "query"
    }
  ]
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

### 401 Unauthorized - Token Expired
```json
{
  "success": false,
  "error": "Token expired. Please login again."
}
```

### 403 Forbidden - Not a Vendor
```json
{
  "success": false,
  "error": "Access denied. Vendor privileges required."
}
```

### 403 Forbidden - Vendor Account Deactivated
```json
{
  "success": false,
  "error": "Vendor account is deactivated"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Important Notes

1. **Automatic Vendor Filtering**: The vendor ID is automatically extracted from the JWT token. Vendors can only see their own job posts.

2. **No Vendor ID Required**: You don't need to pass vendor ID in the request - it's automatically determined from the token.

3. **Pagination**: Default page is 1, default limit is 10.

4. **Search**: The search parameter searches in the job title field (case-insensitive).

5. **Location Filters**: City and state filters are case-insensitive and use regex matching.

6. **Active Status**: If `isActive` is not provided, both active and inactive job posts are returned.

7. **Sorting**: Results are sorted by creation date in descending order (newest first).

---

## Testing with Postman

1. **Method**: GET
2. **URL**: `http://localhost:3010/api/vendor/my-job-posts`
3. **Headers**:
   - Key: `Authorization`
   - Value: `Bearer YOUR_VENDOR_TOKEN`
4. **Params** (optional):
   - `page`: 1
   - `limit`: 10
   - `isActive`: true
   - `search`: delivery
   - `city`: Bangalore
   - `state`: Karnataka
   - `pinCode`: 560001

---

## Related Endpoints

- `POST /api/vendor/job-posts/create` - Create a new job post
- `GET /api/vendor/job-posts/:id` - Get a specific job post
- `PUT /api/vendor/job-posts/:id` - Update a job post
- `DELETE /api/vendor/job-posts/:id` - Delete a job post
- `PATCH /api/vendor/job-posts/:id/toggle-status` - Toggle job post status

---

## Security Features

✅ **Token-based Authentication** - Requires valid vendor JWT token  
✅ **Automatic Vendor Isolation** - Vendors can only see their own job posts  
✅ **Role Verification** - Only vendors can access this endpoint  
✅ **Active Account Check** - Inactive vendors cannot access  
✅ **Input Validation** - All query parameters are validated
