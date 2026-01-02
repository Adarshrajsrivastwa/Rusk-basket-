const { imageProcessingQueue } = require('../utils/queue');
const { uploadToCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');

if (imageProcessingQueue) {
  imageProcessingQueue.process(async (job) => {
    const { file, folder, transformations } = job.data;
    
    logger.info(`Processing image job ${job.id}`);
    
    try {
      const result = await uploadToCloudinary(file, folder);
      
      if (transformations) {
        // TODO: Apply image transformations if needed
        // result.url = applyTransformations(result.url, transformations);
      }
      
      logger.info(`Image processed successfully: ${result.publicId}`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to process image:', error);
      throw error;
    }
  });
  
  logger.info('Image processing worker started');
}

module.exports = imageProcessingQueue;

