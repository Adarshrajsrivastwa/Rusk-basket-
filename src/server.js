require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
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
const ticketRoutes = require('./routes/ticket');

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
    return originalJson.call(this, data);
  };
  next();
});

// Error handler for JSON parsing errors (must be before routes)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
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
app.use('/api/ticket', ticketRoutes);

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
  // Fix index issues - drop problematic unique indexes if they exist
  try {
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all indexes
    const indexes = await usersCollection.indexes();
    
    // Drop email_1 index if it exists and is unique
    const emailIndex = indexes.find(idx => idx.name === 'email_1');
    if (emailIndex && emailIndex.unique) {
      try {
        await usersCollection.dropIndex('email_1');
      } catch (dropError) {
      }
    }
    
    // Drop phone_1 index if it exists and is unique
    const phoneIndex = indexes.find(idx => idx.name === 'phone_1');
    if (phoneIndex && phoneIndex.unique) {
      try {
        await usersCollection.dropIndex('phone_1');
      } catch (dropError) {
      }
    }
  } catch (indexError) {
  }
  
  initializeQueues();
  
  // Create HTTP server
  server = http.createServer(app);
  
  // Initialize Socket.io (optional - will gracefully handle if not installed)
  try {
    const { initializeSocket } = require('./utils/socket');
    const socketResult = initializeSocket(server);
  } catch (socketError) {
  }
  
  server.listen(PORT, () => {
    // Run on startup
    disableExpiredOffers().then(result => {
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
      
      setTimeout(() => {
        // Process daily offers (disable expired and enable new ones)
        processDailyOffers().then(result => {
          if (result.success) {
          }
        }).catch(error => {
        });
        
        // Also run general expired offers check
        disableExpiredOffers().then(result => {
        }).catch(error => {
        });
        
        // Schedule next day
        scheduleDailyOfferCheck();
      }, msUntilNextRun);
    };
    
    // Start scheduling
    scheduleDailyOfferCheck();
  });
})
.catch((error) => {
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  process.exit(1);
});

// Export app for backward compatibility
module.exports = app;

