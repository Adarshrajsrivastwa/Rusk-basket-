# Rusk Basket - E-Commerce Backend API

A comprehensive e-commerce backend API built with Node.js, Express, and MongoDB. This platform supports multi-vendor operations with user, vendor, rider, and admin roles.

## Features

- **Multi-Role System**: User, Vendor, Rider, and Admin roles with role-based access control
- **Vendor Management**: Complete vendor registration, product management, and order handling
- **Order Management**: Full order lifecycle from cart to delivery with status tracking
- **Rider Assignment**: Vendors can assign riders to orders for delivery
- **Order Invoices**: Generate detailed invoices for orders (user, vendor, and admin views)
- **Rider Job Posts**: Location-based job posting system for vendors to hire riders
- **Rider Job Applications**: Riders can apply for jobs, vendors can review and assign
- **Product Management**: Product approval system, categories, subcategories, and SKU management
- **Subcategory Count**: Automatic tracking of subcategory count per category
- **Authentication**: OTP-based authentication for users, vendors, and riders
- **File Upload**: Cloudinary integration for image and document uploads
- **Queue System**: Bull queue with Redis for background jobs (email, SMS, notifications, image processing)
- **Payment Integration**: Support for multiple payment methods (COD, prepaid, wallet, UPI, card)
- **Coupon System**: Discount coupon management and application
- **Location Services**: Post office API integration for address validation and location-based job posts
- **Logging**: Winston-based logging system with file outputs
- **Security**: Rate limiting, input validation, MongoDB sanitization, and security headers

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Cache/Queue**: Redis with Bull
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Cloudinary
- **Validation**: express-validator
- **Logging**: Winston
- **Security**: Helmet, express-rate-limit, xss-clean, express-mongo-sanitize

## Project Structure

```
Rusk-basket-/
├── src/
│   ├── controllers/          # Route controllers
│   │   ├── category.js
│   │   ├── checkout.js
│   │   ├── coupon.js
│   │   ├── productAdd.js
│   │   ├── productApproval.js
│   │   ├── productGet.js
│   │   ├── productUpdate.js
│   │   ├── rider.js
│   │   ├── riderAuth.js
│   │   ├── riderOTP.js
│   │   ├── subCategory.js
│   │   ├── unifiedAuth.js
│   │   ├── user.js
│   │   ├── userAuth.js
│   │   ├── userOTP.js
│   │   ├── userProduct.js
│   │   ├── vendor.js
│   │   ├── vendorAuth.js
│   │   └── vendorOTP.js
│   ├── middleware/           # Custom middleware
│   │   ├── adminAuth.js
│   │   ├── categoryUpload.js
│   │   ├── productAuth.js
│   │   ├── productUpload.js
│   │   ├── riderAuth.js
│   │   ├── riderUpload.js
│   │   ├── subCategoryUpload.js
│   │   ├── upload.js
│   │   ├── userAuth.js
│   │   ├── userUpload.js
│   │   ├── vendorAuth.js
│   │   └── vendorOrAdminAuth.js
│   ├── models/              # Mongoose models
│   │   ├── Admin.js
│   │   ├── Cart.js
│   │   ├── Category.js
│   │   ├── Coupon.js
│   │   ├── Order.js
│   │   ├── Product.js
│   │   ├── Rider.js
│   │   ├── SubCategory.js
│   │   ├── User.js
│   │   └── Vendor.js
│   ├── routes/             # API routes
│   │   ├── auth.js
│   │   ├── category.js
│   │   ├── checkout.js
│   │   ├── coupon.js
│   │   ├── product.js
│   │   ├── queue.js
│   │   ├── rider.js
│   │   ├── subCategory.js
│   │   ├── superadmin.js
│   │   ├── user.js
│   │   └── vendor.js
│   ├── services/           # Business logic services
│   │   ├── checkoutService.js
│   │   ├── productService.js
│   │   ├── riderService.js
│   │   ├── userService.js
│   │   └── vendorService.js
│   ├── utils/             # Utility functions
│   │   ├── cloudinary.js
│   │   ├── logger.js
│   │   ├── postOfficeAPI.js
│   │   ├── queryManager.js
│   │   ├── queue.js
│   │   └── smsService.js
│   ├── workers/           # Background job workers
│   │   ├── emailWorker.js
│   │   ├── imageProcessingWorker.js
│   │   ├── notificationWorker.js
│   │   └── smsWorker.js
│   └── server.js          # Application entry point
├── logs/                  # Application logs
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- MongoDB 5+
- Redis 6+ (for queues and caching)
- Cloudinary account (for file uploads)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd Rusk-basket-
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
NODE_ENV=development
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rushbasket
MONGO_URI=mongodb://localhost:27017/rushbasket

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# CORS
CORS_ORIGIN=http://localhost:5173

# Logging
LOG_LEVEL=info
```

5. Start MongoDB and Redis:
```bash
# MongoDB
mongod

# Redis
redis-server
```

6. Create logs directory:
```bash
mkdir logs
```

7. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Authentication

#### Unified Auth
- `POST /api/auth/login` - Login (user/vendor/rider)
- `POST /api/auth/register` - Register user

#### User Auth
- `POST /api/user/login` - Send OTP for user login
- `POST /api/user/verify-login-otp` - Verify OTP and login

#### Vendor Auth
- `POST /api/vendor/send-otp` - Send OTP to vendor
- `POST /api/vendor/verify-otp` - Verify vendor OTP

#### Rider Auth
- `POST /api/rider/send-otp` - Send OTP to rider
- `POST /api/rider/verify-otp` - Verify rider OTP

### Users

- `GET /api/user/profile` - Get user profile (protected)
- `PUT /api/user/profile` - Update user profile (protected)
- `GET /api/user/products` - Get all products (public)

### Vendors

- `POST /api/vendor/create` - Create vendor (admin only)
- `GET /api/vendor` - Get all vendors (admin only)
- `GET /api/vendor/:id` - Get vendor by ID (admin only)
- `PUT /api/vendor/:id/permissions` - Update vendor permissions (admin only)
- `PUT /api/vendor/:id/documents` - Update vendor documents (admin only)
- `PUT /api/vendor/:id/radius` - Update service radius (vendor/admin)
- `PUT /api/vendor/:id/suspend` - Suspend/activate vendor (admin only)
- `DELETE /api/vendor/:id` - Delete vendor (admin only)

#### Vendor Orders
- `GET /api/vendor/orders` - Get all vendor orders (vendor only)
- `GET /api/vendor/orders/:id` - Get order by ID (vendor only)
- `PUT /api/vendor/orders/:id/status` - Update order status (vendor only)
- `PUT /api/vendor/orders/:orderId/assign-rider` - Assign rider to order (vendor only)

### Products

- `POST /api/product/add` - Add product (vendor only)
- `GET /api/product` - Get all products (public)
  - Query params: `?latitude=xx&longitude=xx&radius=10` - Filter by location and radius (km)
  - Query params: `?category=xxx`, `?subCategory=xxx`, `?search=xxx`
  - Products are filtered by:
    1. User's query radius (if location provided)
    2. Vendor's service radius (product shown if user is within vendor's delivery radius)
- `GET /api/product/:id` - Get product by ID (public)
- `PUT /api/product/:id` - Update product (vendor/admin)
- `DELETE /api/product/:id` - Delete product (vendor/admin)
- `GET /api/product/pending` - Get pending products (admin only)
- `PUT /api/product/:id/approve` - Approve product (admin only)

### Categories

- `POST /api/category` - Create category (admin only)
- `GET /api/category` - Get all categories (public)
- `GET /api/category/:id` - Get category by ID (public)
- `PUT /api/category/:id` - Update category (admin only)
- `DELETE /api/category/:id` - Delete category (admin only)

### Sub Categories

- `POST /api/subcategory` - Create subcategory (admin only)
- `GET /api/subcategory` - Get all subcategories (public)
- `GET /api/subcategory/:id` - Get subcategory by ID (public)
- `PUT /api/subcategory/:id` - Update subcategory (admin only)
- `DELETE /api/subcategory/:id` - Delete subcategory (admin only)

### Checkout & Orders

#### Cart
- `GET /api/checkout/cart` - Get cart (user only)
- `POST /api/checkout/cart/add` - Add item to cart (user only)
- `PUT /api/checkout/cart/item/:itemId` - Update cart item (user only)
- `DELETE /api/checkout/cart/item/:itemId` - Remove cart item (user only)
- `DELETE /api/checkout/cart/clear` - Clear cart (user only)

#### Coupons
- `POST /api/checkout/cart/coupon/apply` - Apply coupon (user only)
- `DELETE /api/checkout/cart/coupon/remove` - Remove coupon (user only)

#### Orders
- `POST /api/checkout/order/create` - Create order (user only)
- `GET /api/checkout/orders` - Get user orders (user only)
- `GET /api/checkout/order/:orderId` - Get order by ID (user only)
- `GET /api/checkout/order/:orderId/invoice` - Get order invoice (user only)
- `POST /api/checkout/order/:orderId/cancel` - Cancel order (user only)

#### Vendor Orders
- `GET /api/checkout/vendor/orders` - Get vendor orders (vendor only)
- `GET /api/checkout/vendor/order/:orderId` - Get vendor order by ID (vendor only)
- `PUT /api/checkout/vendor/order/:orderId/status` - Update order status (vendor only)
- `GET /api/checkout/vendor/order/:orderId/invoice` - Get order invoice (vendor only)

### Coupons

- `POST /api/coupon` - Create coupon (admin only)
- `GET /api/coupon` - Get all coupons (admin only)
- `GET /api/coupon/:id` - Get coupon by ID (admin only)
- `PUT /api/coupon/:id` - Update coupon (admin only)
- `DELETE /api/coupon/:id` - Delete coupon (admin only)

### Riders

- `POST /api/rider/create` - Create rider (admin only)
- `GET /api/rider` - Get all riders (admin only)
- `GET /api/rider/:id` - Get rider by ID (admin only)
- `PUT /api/rider/:id` - Update rider (admin/rider)
- `DELETE /api/rider/:id` - Delete rider (admin only)

### Rider Job Posts

- `POST /api/rider-job-post/create` - Create job post (vendor only, vendor auto-selected from credentials)
- `POST /api/rider-job-post/admin/create` - Create job post (admin only, must select vendor)
- `GET /api/rider-job-post` - Get job posts (public/vendor/admin)
  - Public: See all active posts (can filter by vendor, city, state, etc.)
  - Vendor: See only their own posts (vendor query param ignored for security)
  - Admin: See all posts, can filter by any vendor using `?vendor=vendorId`
- `GET /api/rider-job-post/admin/all` - Get all job posts (admin only, can filter by any vendor)
- `GET /api/rider-job-post/:id` - Get job post by ID (public)
- `PUT /api/rider-job-post/:id` - Update job post (vendor only, own posts)
- `DELETE /api/rider-job-post/:id` - Delete job post (vendor only, own posts)
- `PATCH /api/rider-job-post/:id/toggle-status` - Toggle job post status (vendor only, own posts)

#### Vendor Routes for Job Posts

- `POST /api/vendor/job-posts/create` - Create job post (vendor only)
- `GET /api/vendor/job-posts` - Get all job posts for this vendor (vendor only)
- `GET /api/vendor/job-posts/:id` - Get single job post (vendor can only see their own)
- `PUT /api/vendor/job-posts/:id` - Update job post (vendor can only update their own)
- `DELETE /api/vendor/job-posts/:id` - Delete job post (vendor can only delete their own)
- `PATCH /api/vendor/job-posts/:id/toggle-status` - Toggle job post status (vendor can only toggle their own)

### Rider Job Applications

- `POST /api/rider-job-application/apply` - Apply for job (rider only)
- `GET /api/rider-job-application/my-applications` - Get my applications (rider only)
- `GET /api/rider-job-application/:applicationId` - Get application by ID (rider only)
- `GET /api/rider-job-application/job/:jobPostId` - Get applications for job post (vendor only)
- `PUT /api/rider-job-application/:applicationId/review` - Review application (approve/reject) (vendor only)
- `PUT /api/rider-job-application/:applicationId/assign` - Assign rider to job (vendor only)
- `GET /api/rider-job-application/job/:jobPostId/assigned` - Get assigned riders for job post (vendor only)

#### Vendor Routes for Job Applications

- `GET /api/vendor/job-applications` - Get all applications for all job posts of this vendor (vendor only)
  - Query params: `?status=pending`, `?jobPostId=xxx`, `?page=1&limit=10`
- `GET /api/vendor/job-posts/:jobPostId/applications` - Get applications for a specific job post (vendor only)
- `GET /api/vendor/job-applications/:applicationId` - Get single application (vendor can only see applications for their own job posts)
- `PUT /api/vendor/job-applications/:applicationId/review` - Review application (approve/reject) (vendor only)
- `PUT /api/vendor/job-applications/:applicationId/assign` - Assign rider to job (vendor only)
- `GET /api/vendor/job-posts/:jobPostId/assigned-riders` - Get assigned riders for a job post (vendor only)

### Health Check

- `GET /health` - Health check endpoint

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## User Roles

- **user**: Can browse products, manage cart, create orders, and manage own profile
- **vendor**: Can add products, manage own products, view and update orders containing their items
- **rider**: Can view assigned orders and update delivery status
- **admin**: Full access to all resources, can manage users, vendors, riders, products, categories, and orders

## Order Status Flow

1. `pending` - Order created, awaiting confirmation
2. `confirmed` - Order confirmed by vendor
3. `processing` - Order being prepared
4. `ready` - Order ready for pickup
5. `out_for_delivery` - Order assigned to rider, on the way
6. `delivered` - Order delivered successfully
7. `cancelled` - Order cancelled
8. `refunded` - Order refunded

## Payment Methods

- `cod` - Cash on Delivery
- `prepaid` - Prepaid payment
- `wallet` - Wallet payment
- `upi` - UPI payment
- `card` - Card payment

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `MONGODB_URI` | MongoDB connection string | - |
| `JWT_SECRET` | Secret key for JWT tokens | - |
| `JWT_EXPIRE` | JWT token expiration | 7d |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | - |
| `CLOUDINARY_API_KEY` | Cloudinary API key | - |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | - |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:5173 |
| `LOG_LEVEL` | Logging level | info |

## Background Workers

The application uses Bull queues with Redis for background processing:

- **Email Worker**: Sends emails asynchronously
- **SMS Worker**: Sends SMS notifications
- **Notification Worker**: Handles push notifications
- **Image Processing Worker**: Processes and optimizes uploaded images

## Logging

Logs are written to:
- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

Log levels: error, warn, info, verbose, debug

## Error Handling

All errors are handled centrally and return consistent JSON responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

For validation errors:

```json
{
  "success": false,
  "errors": [
    {
      "msg": "Error message",
      "param": "fieldName",
      "location": "body"
    }
  ]
}
```

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

## Production

1. Set `NODE_ENV=production`
2. Use strong secrets for `JWT_SECRET`
3. Enable MongoDB authentication
4. Configure proper CORS origins
5. Set up proper logging and monitoring
6. Use reverse proxy (nginx) for additional security
7. Enable SSL/TLS certificates
8. Configure Redis password protection

## License

ISC

## Support

For issues and questions, please open an issue in the repository.
