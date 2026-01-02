# Rush Basket - E-Commerce Backend API

A scalable, secure, and production-ready backend API for an e-commerce platform built with Node.js, Express, and MongoDB.

## Features

- **Security First**: Comprehensive security middleware including DDoS protection, rate limiting, XSS protection, SQL injection prevention, and more
- **Scalable Architecture**: Designed for horizontal scaling
- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **RESTful API**: Clean and well-structured REST API endpoints
- **Error Handling**: Centralized error handling with detailed logging
- **Input Validation**: Request validation using express-validator
- **Logging**: Winston-based logging system with file and console outputs
- **Database**: MongoDB with Mongoose ODM
- **Caching**: Redis integration for session management and caching
- **Production Ready**: Optimized for production with compression, security headers, and best practices

## Security Features

- **Rate Limiting**: Prevents API abuse and DDoS attacks
- **Slow Down**: Progressive delay for repeated requests
- **Helmet**: Sets various HTTP headers for security
- **CORS**: Configurable Cross-Origin Resource Sharing
- **XSS Protection**: Prevents Cross-Site Scripting attacks
- **MongoDB Sanitization**: Prevents NoSQL injection attacks
- **HPP**: Protects against HTTP Parameter Pollution
- **Password Hashing**: Bcrypt with configurable salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Session Management**: Redis-backed session storage
- **Input Validation**: Request body validation and sanitization

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Cache/Session**: Redis
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: express-validator
- **Logging**: Winston
- **Security**: Helmet, express-rate-limit, xss-clean, express-mongo-sanitize

## Project Structure

```
rush-basket-backend/
├── src/
│   ├── controllers/       # Route controllers
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── products.js
│   │   ├── categories.js
│   │   └── orders.js
│   ├── middleware/        # Custom middleware
│   │   ├── auth.js        # Authentication & authorization
│   │   ├── security.js    # Security middleware
│   │   └── errorHandler.js
│   ├── models/           # Mongoose models
│   │   ├── User.js
│   │   ├── Product.js
│   │   ├── Category.js
│   │   └── Order.js
│   ├── routes/           # API routes
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── products.js
│   │   ├── categories.js
│   │   └── orders.js
│   ├── utils/           # Utility functions
│   │   └── logger.js
│   └── server.js        # Application entry point
├── logs/                # Application logs
├── package.json
└── README.md
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- MongoDB 5+
- Redis 6+ (optional but recommended)

### Local Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd rush-basket-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env` file with your configuration:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/rushbasket
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
BCRYPT_SALT_ROUNDS=12
REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:3000
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
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user (protected)
- `GET /api/auth/me` - Get current user (protected)
- `PUT /api/auth/updatepassword` - Update password (protected)
- `POST /api/auth/forgotpassword` - Request password reset
- `PUT /api/auth/resetpassword/:resettoken` - Reset password

### Users
- `GET /api/users` - Get all users (admin/moderator)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (admin)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin)

### Products
- `GET /api/products` - Get all products (with pagination, filtering, sorting)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product (admin/moderator)
- `PUT /api/products/:id` - Update product (admin/moderator)
- `DELETE /api/products/:id` - Delete product (admin)

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get category by ID
- `POST /api/categories` - Create category (admin/moderator)
- `PUT /api/categories/:id` - Update category (admin/moderator)
- `DELETE /api/categories/:id` - Delete category (admin)

### Orders
- `GET /api/orders` - Get all orders (admin/moderator)
- `GET /api/orders/myorders` - Get current user's orders (protected)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order (protected)
- `PUT /api/orders/:id` - Update order (admin/moderator)

### Health Check
- `GET /health` - Health check endpoint

## Request/Response Examples

### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Create Product
```bash
POST /api/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Name",
  "description": "Product description",
  "price": 99.99,
  "category": "category_id",
  "stock": 100,
  "images": [
    {
      "url": "https://example.com/image.jpg",
      "alt": "Product image"
    }
  ]
}
```

### Create Order
```bash
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "product": "product_id",
      "quantity": 2
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA",
    "phone": "+1234567890"
  },
  "paymentMethod": "credit_card"
}
```

## Query Parameters

### Products
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12)
- `category` - Filter by category ID
- `search` - Search in name, description, tags
- `minPrice` - Minimum price filter
- `maxPrice` - Maximum price filter
- `isActive` - Filter by active status
- `isFeatured` - Filter featured products
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - Sort order: asc or desc (default: desc)

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Or use cookies (token is automatically set in cookies on login/register).

## User Roles

- **user**: Default role, can create orders and manage own account
- **moderator**: Can manage products and categories
- **admin**: Full access to all resources

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/rushbasket |
| `JWT_SECRET` | Secret key for JWT tokens | - |
| `JWT_EXPIRE` | JWT token expiration | 7d |
| `BCRYPT_SALT_ROUNDS` | Bcrypt salt rounds | 12 |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `REDIS_PASSWORD` | Redis password | - |
| `SESSION_SECRET` | Session secret key | - |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `CORS_ORIGIN` | Allowed CORS origin | * |
| `LOG_LEVEL` | Logging level | info |

## Security Best Practices

1. **Change Default Secrets**: Always change JWT_SECRET and SESSION_SECRET in production
2. **Use HTTPS**: Always use HTTPS in production
3. **Environment Variables**: Never commit `.env` file to version control
4. **Rate Limiting**: Adjust rate limits based on your traffic patterns
5. **Database**: Use MongoDB authentication and restrict network access
6. **Redis**: Use password protection for Redis in production
7. **Logging**: Monitor logs regularly for suspicious activity
8. **Updates**: Keep all dependencies updated

## Scalability

The backend is designed for horizontal scaling:

1. **Stateless Design**: JWT tokens allow stateless authentication
2. **Database Indexing**: Proper indexes for efficient queries
3. **Redis Caching**: Session and cache data in Redis
4. **Load Balancing**: Can be deployed behind a load balancer
5. **Connection Pooling**: MongoDB connection pooling enabled

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

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

## Production

1. Set `NODE_ENV=production`
2. Use strong secrets for JWT_SECRET and SESSION_SECRET
3. Enable MongoDB authentication
4. Configure proper CORS origins
5. Set up proper logging and monitoring
6. Use reverse proxy (nginx) for additional security
7. Enable SSL/TLS certificates

## License

ISC

## Support

For issues and questions, please open an issue in the repository.

