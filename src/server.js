require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const logger = require('./utils/logger');
const { initializeQueues } = require('./utils/queue');

require('./workers/emailWorker');
require('./workers/smsWorker');
require('./workers/notificationWorker');
require('./workers/imageProcessingWorker');

const app = express();
const PORT = process.env.PORT || 3000;

const cookieParser = require('cookie-parser');

app.use(compression());
app.use(express.json({ limit: '10mb' }));
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
const queueRoutes = require('./routes/queue');

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
      process.env.CORS_ORIGIN,
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
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
app.use('/api/queue', queueRoutes);

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
.then(() => {
  logger.info('MongoDB connected successfully');
  initializeQueues();
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
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

module.exports = app;

