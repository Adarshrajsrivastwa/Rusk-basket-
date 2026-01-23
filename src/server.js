require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const logger = require('./utils/logger');
const { initializeQueues } = require('./utils/queue');
const { disableExpiredOffers, processDailyOffers } = require('./utils/offerExpiryService');

require('./workers/emailWorker');
require('./workers/smsWorker');
require('./workers/notificationWorker');
require('./workers/imageProcessingWorker');

const app = express();
const PORT = process.env.PORT || 3000;
const http = require('http');
let server = null;

const cookieParser = require('cookie-parser');

app.use(compression());

// Middleware to capture raw body for incorrect content-type handling
// This must run BEFORE express.json() to intercept requests with wrong content-type
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'] || '';
    // If content-type is wrong but should be JSON, capture and parse raw body
    if (contentType.includes('javascript') || (contentType.includes('text') && !contentType.includes('json'))) {
      let data = '';
      req.on('data', chunk => {
        data += chunk.toString();
      });
      req.on('end', () => {
        try {
          req.rawBody = data;
          if (data.trim()) {
            req.body = JSON.parse(data);
          } else {
            req.body = {};
          }
        } catch (e) {
          req.rawBody = data;
          req.body = {};
          logger.error('JSON parsing error in custom middleware:', {
            error: e.message,
            position: e.message.match(/position (\d+)/)?.[1],
            body: data.substring(0, 200),
            url: req.url,
            method: req.method,
            service: 'rush-basket-backend',
            timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
          });
          
          // Check for common JSON errors and provide helpful messages
          let errorMessage = 'Invalid JSON format in request body';
          let hint = '';
          
          if (e.message.includes('trailing comma') || e.message.includes('Expected double-quoted property name')) {
            errorMessage = 'JSON syntax error: Trailing comma detected';
            hint = 'Remove trailing commas from your JSON. Example: {"quantity": 5} not {"quantity": 5,}';
          } else if (e.message.includes('Unexpected token')) {
            errorMessage = 'JSON syntax error: Unexpected token';
            hint = 'Check for missing quotes, brackets, or invalid characters';
          } else if (e.message.includes('Unexpected end')) {
            errorMessage = 'JSON syntax error: Incomplete JSON';
            hint = 'Ensure all brackets and braces are properly closed';
          }
          
          // Return error response immediately for better UX
          return res.status(400).json({
            success: false,
            error: errorMessage,
            message: e.message,
            hint: hint || 'Please ensure: 1) All property names use double quotes, 2) No trailing commas, 3) Valid JSON syntax',
            position: e.message.match(/position (\d+)/)?.[1]
          });
        }
        next();
      });
      return;
    }
  }
  next();
});

// JSON parser with better error handling
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      logger.error('Invalid JSON in request body:', {
        error: e.message,
        body: buf.toString().substring(0, 200), // First 200 chars
        url: req.url,
        method: req.method
      });
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

const cors = require('cors');
const superadminRoutes = require('./routes/superadmin');
const authRoutes = require('./routes/auth');
const vendorRoutes = require('./routes/vendor');
const userRoutes = require('./routes/user');
const riderRoutes = require('./routes/rider');
const categoryRoutes = require('./routes/category');
const subCategoryRoutes = require('./routes/subCategory');
const productRoutes = require('./routes/product');
const couponRoutes = require('./routes/coupon');
const checkoutRoutes = require('./routes/checkout');
const wishlistRoutes = require('./routes/wishlist');
const queueRoutes = require('./routes/queue');
const riderJobPostRoutes = require('./routes/riderJobPost');
const riderJobApplicationRoutes = require('./routes/riderJobApplication');
const bannerRoutes = require('./routes/banner');
const analyticsRoutes = require('./routes/analytics');
const suggestionRoutes = require('./routes/suggestion');

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://46.202.164.93',
      'https://grocery.rushbaskets.com',
      'https://admin.rushbaskets.com',
      'https://api.rushbaskets.com',
      process.env.CORS_ORIGIN,
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // IMPORTANT: Cookies allow karne ke liye
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    if (req.path.includes('login') || req.path.includes('verify') || req.path.includes('test-cookie')) {
      logger.info(`Response for ${req.path}:`, {
        hasCookieHeader: !!res.getHeader('Set-Cookie'),
        cookieHeader: res.getHeader('Set-Cookie'),
      });
    }
    return originalJson.call(this, data);
  };
  next();
});

// Error handler for JSON parsing errors (must be before routes)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('JSON parsing error:', {
      error: err.message,
      url: req.url,
      method: req.method,
      contentType: req.headers['content-type']
    });
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON format in request body',
      message: err.message,
      hint: 'Please ensure: 1) All property names use double quotes, 2) No trailing commas, 3) Valid JSON syntax'
    });
  }
  next(err);
});

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/user', userRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/subcategory', subCategoryRoutes);
app.use('/api/product', productRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/rider-job-post', riderJobPostRoutes);
app.use('/api/rider-job-application', riderJobApplicationRoutes);
app.use('/api/banner', bannerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/suggestion', suggestionRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/test-cookie', (req, res) => {
  const { setTokenCookie } = require('./utils/cookieHelper');
  const testToken = 'test-token-12345';
  setTokenCookie(res, testToken);
  res.status(200).json({
    success: true,
    message: 'Test cookie set',
    token: testToken,
    cookies: req.cookies,
  });
});

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/rushbasket')
.then(async () => {
  logger.info('MongoDB connected successfully');
  
  // Fix index issues - drop problematic unique indexes if they exist
  try {
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all indexes
    const indexes = await usersCollection.indexes();
    
    // Drop email_1 index if it exists and is unique
    const emailIndex = indexes.find(idx => idx.name === 'email_1');
    if (emailIndex && emailIndex.unique) {
      logger.info('Removing unique constraint from email index...');
      try {
        await usersCollection.dropIndex('email_1');
        logger.info('Successfully removed unique email index');
      } catch (dropError) {
        if (dropError.code !== 27) {
          logger.warn('Error dropping email index:', dropError.message);
        }
      }
    }
    
    // Drop phone_1 index if it exists and is unique
    const phoneIndex = indexes.find(idx => idx.name === 'phone_1');
    if (phoneIndex && phoneIndex.unique) {
      logger.info('Removing unique constraint from phone index...');
      try {
        await usersCollection.dropIndex('phone_1');
        logger.info('Successfully removed unique phone index');
      } catch (dropError) {
        if (dropError.code !== 27) {
          logger.warn('Error dropping phone index:', dropError.message);
        }
      }
    }
  } catch (indexError) {
    if (indexError.code === 27 || indexError.codeName === 'IndexNotFound') {
      logger.info('Indexes do not exist or already removed');
    } else {
      logger.warn('Error checking/fixing indexes:', indexError.message);
    }
  }
  
  initializeQueues();
  
  // Create HTTP server
  server = http.createServer(app);
  
  // Initialize Socket.io (optional - will gracefully handle if not installed)
  try {
    const { initializeSocket } = require('./utils/socket');
    const socketResult = initializeSocket(server);
    if (socketResult) {
      logger.info('WebSocket server initialized for real-time rider notifications');
    } else {
      logger.warn('WebSocket server not initialized. Socket.io may not be installed.');
    }
  } catch (socketError) {
    logger.warn('Failed to initialize WebSocket server:', socketError.message);
    logger.warn('Server will continue without WebSocket functionality. Install socket.io to enable real-time notifications.');
  }
  
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    
    // Run on startup
    disableExpiredOffers().then(result => {
      if (result.success && result.disabledCount > 0) {
        logger.info(`Disabled ${result.disabledCount} expired offers on startup`);
      }
    });
    
    // Schedule daily offer processing to run daily at 5 AM IST
    const scheduleDailyOfferCheck = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(5, 0, 0, 0); // Set to 5 AM tomorrow
      
      // If it's already past 5 AM today, schedule for tomorrow
      const today5AM = new Date(now);
      today5AM.setHours(5, 0, 0, 0);
      
      const nextRun = now < today5AM ? today5AM : tomorrow;
      const msUntilNextRun = nextRun.getTime() - now.getTime();
      
      logger.info(`Daily offer check scheduled for: ${nextRun.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
      logger.info(`Next check in: ${Math.round(msUntilNextRun / 1000 / 60)} minutes`);
      
      setTimeout(() => {
        // Process daily offers (disable expired and enable new ones)
        processDailyOffers().then(result => {
          if (result.success) {
            if (result.disabledCount > 0 || result.enabledCount > 0) {
              logger.info(`Daily offer processing at 5 AM: Disabled ${result.disabledCount} expired, Enabled ${result.enabledCount} new daily offers`);
            } else {
              logger.info('Daily offer check completed at 5 AM - no changes needed');
            }
          }
        }).catch(error => {
          logger.error('Error in daily offer processing service:', error);
        });
        
        // Also run general expired offers check
        disableExpiredOffers().then(result => {
          if (result.success && result.disabledCount > 0) {
            logger.info(`Disabled ${result.disabledCount} expired offers at 5 AM daily check`);
          }
        }).catch(error => {
          logger.error('Error in offer expiry service:', error);
        });
        
        // Schedule next day
        scheduleDailyOfferCheck();
      }, msUntilNextRun);
    };
    
    // Start scheduling
    scheduleDailyOfferCheck();
    logger.info('Daily offer processing service scheduled to run every day at 5 AM (IST)');
  });
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Export app for backward compatibility
module.exports = app;

