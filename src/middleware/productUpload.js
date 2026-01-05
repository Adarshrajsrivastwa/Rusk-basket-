const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

// File filter for images and videos
const imageVideoFileFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|webp/;
  const videoTypes = /mp4|mov|avi|wmv|flv|webm/;
  const extname = imageTypes.test(path.extname(file.originalname).toLowerCase()) || 
                  videoTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = imageTypes.test(file.mimetype) || 
                   file.mimetype.startsWith('video/');

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, webp) and video files (mp4, mov, avi, wmv, flv, webm) are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
  },
  fileFilter: imageVideoFileFilter,
});

const uploadFields = upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'thumbnails', maxCount: 1 },
  { name: 'images', maxCount: 20 },
  { name: 'images[]', maxCount: 20 },
  { name: 'image', maxCount: 20 },
  { name: 'image[]', maxCount: 20 },
]);

const uploadMultipleWithErrorHandling = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          const allowedFields = ['thumbnail', 'thumbnails', 'images', 'images[]', 'image', 'image[]'];
          return res.status(400).json({
            success: false,
            error: `Unexpected field: "${err.field}". Allowed fields are: ${allowedFields.join(', ')}.`,
            receivedField: err.field,
            allowedFields: allowedFields,
          });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size too large. Maximum size is 5MB per file',
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: 'Too many files uploaded',
          });
        }
        return res.status(400).json({
          success: false,
          error: `File upload error: ${err.message}`,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload error',
      });
    }

    // Organize files into req.files object
    const files = req.files || {};
    
    let thumbnail = null;
    const images = [];
    
    // Get thumbnail (prefer 'thumbnail' field, fallback to 'thumbnails')
    if (files.thumbnail && files.thumbnail[0]) {
      thumbnail = files.thumbnail[0];
    } else if (files.thumbnails && files.thumbnails[0]) {
      thumbnail = files.thumbnails[0];
    }
    
    // Validate thumbnail is an image (not video)
    if (thumbnail && thumbnail.mimetype && thumbnail.mimetype.startsWith('video/')) {
      return res.status(400).json({
        success: false,
        error: 'Thumbnail must be an image file, not a video',
      });
    }
    
    // Collect all images/videos
    if (files.images) images.push(...files.images);
    if (files['images[]']) images.push(...files['images[]']);
    if (files.image) images.push(...files.image);
    if (files['image[]']) images.push(...files['image[]']);
    
    req.files = {
      thumbnail: thumbnail,
      images: images,
    };
    
    next();
  });
};

module.exports = { uploadMultiple: uploadMultipleWithErrorHandling };
