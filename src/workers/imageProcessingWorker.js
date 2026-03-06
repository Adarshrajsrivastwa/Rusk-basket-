const logger = require('../utils/logger');
const { uploadToCloudinary } = require('../utils/cloudinary');

/**
 * Initialize the image processing worker
 */
const initializeImageProcessingWorker = () => {
  const { imageProcessingQueue } = require('../utils/queue');

  if (imageProcessingQueue) {
    imageProcessingQueue.process(async (job) => {
      const { file, folder, transformations } = job.data;

      try {
        const result = await uploadToCloudinary(file, folder);

        if (transformations) {
          // TODO: Apply image transformations if needed
        }

        return { success: true, ...result };
      } catch (error) {
        logger.error('Image processing worker error:', error);
        throw error;
      }
    });
    logger.info('Image processing worker started processing');
  }
};

module.exports = { initializeImageProcessingWorker };

