const Queue = require('bull');
const logger = require('./logger');

let Redis = null;
try {
  Redis = require('ioredis');
} catch (error) {
  logger.warn('ioredis not installed. Queue functionality will be limited.');
}

let emailQueue = null;
let smsQueue = null;
let notificationQueue = null;
let imageProcessingQueue = null;

const createQueue = (name, redisConfig) => {
  try {
    if (!Redis) {
      logger.warn(`Queue ${name} requires Redis (ioredis package)`);
      return null;
    }

    let redisConnection;

    if (process.env.REDIS_URL) {
      const redisUrl = process.env.REDIS_URL.replace(/\s+/g, '').trim();
      redisConnection = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
      });
    } else {
      redisConnection = new Redis({
        host: redisConfig.host || process.env.REDIS_HOST || 'localhost',
        port: redisConfig.port || parseInt(process.env.REDIS_PORT) || 6379,
        password: redisConfig.password || process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
      });
    }

    redisConnection.on('connect', () => {
      logger.info(`Redis connected for queue ${name}`);
    });

    redisConnection.on('error', (err) => {
      logger.error(`Redis connection error for queue ${name}:`, err);
    });

    const queue = new Queue(name, {
      createClient: (type) => {
        switch (type) {
          case 'client':
            return redisConnection;
          case 'subscriber':
            return redisConnection.duplicate();
          default:
            return redisConnection.duplicate();
        }
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });

    queue.on('completed', (job) => {
      logger.info(`Job ${job.id} completed in queue ${name}`);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed in queue ${name}:`, err);
    });

    queue.on('error', (error) => {
      logger.error(`Queue ${name} error:`, error);
    });

    return queue;
  } catch (error) {
    logger.error(`Failed to create queue ${name}:`, error);
    return null;
  }
};

const initializeQueues = () => {
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    emailQueue = createQueue('email', {});
    smsQueue = createQueue('sms', {});
    notificationQueue = createQueue('notifications', {});
    imageProcessingQueue = createQueue('image-processing', {});
    logger.info('Queues initialized successfully');
  } else {
    logger.warn('Redis not configured. Queues will not be available.');
  }
};

const addEmailJob = async (data, options = {}) => {
  if (!emailQueue) {
    logger.warn('Email queue not initialized');
    return null;
  }
  return await emailQueue.add(data, options);
};

const addSMSJob = async (data, options = {}) => {
  if (!smsQueue) {
    logger.warn('SMS queue not initialized');
    return null;
  }
  return await smsQueue.add(data, options);
};

const addNotificationJob = async (data, options = {}) => {
  if (!notificationQueue) {
    logger.warn('Notification queue not initialized');
    return null;
  }
  return await notificationQueue.add(data, options);
};

const addImageProcessingJob = async (data, options = {}) => {
  if (!imageProcessingQueue) {
    logger.warn('Image processing queue not initialized');
    return null;
  }
  return await imageProcessingQueue.add(data, options);
};

const getQueueStats = async () => {
  const stats = {};
  
  if (emailQueue) {
    const emailStats = await emailQueue.getJobCounts();
    stats.email = emailStats;
  }
  
  if (smsQueue) {
    const smsStats = await smsQueue.getJobCounts();
    stats.sms = smsStats;
  }
  
  if (notificationQueue) {
    const notificationStats = await notificationQueue.getJobCounts();
    stats.notifications = notificationStats;
  }
  
  if (imageProcessingQueue) {
    const imageStats = await imageProcessingQueue.getJobCounts();
    stats.imageProcessing = imageStats;
  }
  
  return stats;
};

module.exports = {
  initializeQueues,
  addEmailJob,
  addSMSJob,
  addNotificationJob,
  addImageProcessingJob,
  getQueueStats,
  emailQueue,
  smsQueue,
  notificationQueue,
  imageProcessingQueue,
};
