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

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const superadminRoutes = require('./routes/superadmin');
const vendorRoutes = require('./routes/vendor');
const categoryRoutes = require('./routes/category');
const subCategoryRoutes = require('./routes/subCategory');
const queueRoutes = require('./routes/queue');

app.use('/api/superadmin', superadminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/subcategory', subCategoryRoutes);
app.use('/api/queue', queueRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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

