const { imageProcessingQueue } = require('../utils/queue');
const { uploadToCloudinary } = require('../utils/cloudinary');

if (imageProcessingQueue) {
  imageProcessingQueue.process(async (job) => {
    const { file, folder, transformations } = job.data;
    
    try {
      const result = await uploadToCloudinary(file, folder);
      
      if (transformations) {
        // TODO: Apply image transformations if needed
        // result.url = applyTransformations(result.url, transformations);
      }
      
      return { success: true, ...result };
    } catch (error) {
      throw error;
    }
  });
}

module.exports = imageProcessingQueue;

