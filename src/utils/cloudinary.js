const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const { Readable } = require('stream');

const uploadToCloudinary = async (file, folder = 'rush-basket', resourceType = 'auto') => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    // Determine resource type based on file mimetype if not explicitly provided
    let finalResourceType = resourceType;
    if (resourceType === 'auto' && file.mimetype) {
      if (file.mimetype === 'application/pdf') {
        finalResourceType = 'raw';
      } else if (file.mimetype.startsWith('image/')) {
        finalResourceType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        finalResourceType = 'video';
      }
    }

    const uploadOptions = {
      folder: folder,
      resource_type: finalResourceType,
      use_filename: true,
      unique_filename: true,
    };

    let result;
    if (file.buffer) {
      return new Promise((resolve, reject) => {
        // Use upload_stream for safe buffer upload (prevents corruption)
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, uploadResult) => {
            if (error) {
              logger.error('Cloudinary upload stream error:', error);
              reject(error);
            } else {
              // Verify URL format is correct (must have /raw/upload/ for PDFs)
              const url = uploadResult.secure_url;
              if (finalResourceType === 'raw' && !url.includes('/raw/upload/')) {
                logger.warn(`PDF uploaded but URL format may be incorrect: ${url}`);
              }
              resolve({
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
              });
            }
          }
        );
        
        // Properly pipe buffer to upload stream
        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
        
        // Ensure stream completes properly
        stream.on('error', (err) => {
          logger.error('Stream error during upload:', err);
          reject(err);
        });
      });
    } else if (file.path) {
      result = await cloudinary.uploader.upload(file.path, uploadOptions);
    } else {
      throw new Error('Invalid file format');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw error;
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      return;
    }
    await cloudinary.uploader.destroy(publicId);
    logger.info(`Deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    logger.error('Cloudinary delete error:', error);
    throw error;
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };

