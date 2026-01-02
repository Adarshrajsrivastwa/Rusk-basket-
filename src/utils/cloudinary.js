const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const { Readable } = require('stream');

const uploadToCloudinary = async (file, folder = 'rush-basket') => {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const uploadOptions = {
      folder: folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    };

    let result;
    if (file.buffer) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, uploadResult) => {
            if (error) {
              logger.error('Cloudinary upload stream error:', error);
              reject(error);
            } else {
              resolve({
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
              });
            }
          }
        );
        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
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

