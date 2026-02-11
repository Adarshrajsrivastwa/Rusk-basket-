const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png) and PDF files are allowed'));
  }
};

// File filter for delivery images (only images, no PDF)
const deliveryImageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed for delivery images'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: fileFilter,
});

const uploadRiderFiles = upload.fields([
  { name: 'profile', maxCount: 1 },
  { name: 'aadharCardPhoto', maxCount: 1 },
  { name: 'panCardFront', maxCount: 1 },
  { name: 'panCardBack', maxCount: 1 },
  { name: 'drivingLicenseFront', maxCount: 1 },
  { name: 'drivingLicenseBack', maxCount: 1 },
  { name: 'cancelCheque', maxCount: 1 },
]);

// Single image upload for delivery image (only images, no PDF)
// Accepts both 'deliveryImage' and 'deliveredImage' field names
const uploadDeliveryImageMulter = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: deliveryImageFileFilter,
});

// Accept either deliveryImage or deliveredImage field
const uploadDeliveryImage = uploadDeliveryImageMulter.fields([
  { name: 'deliveryImage', maxCount: 1 },
  { name: 'deliveredImage', maxCount: 1 },
]);

const uploadRiderFilesWithErrorHandling = (req, res, next) => {
  uploadRiderFiles(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          const allowedFields = ['profile', 'aadharCardPhoto', 'panCardFront', 'panCardBack', 'drivingLicenseFront', 'drivingLicenseBack', 'cancelCheque'];
          return res.status(400).json({
            success: false,
            error: `Unexpected field: "${err.field}". Allowed fields are: ${allowedFields.join(', ')}. Please ensure field names match exactly (no extra spaces).`,
            receivedField: err.field,
            allowedFields: allowedFields,
            hint: 'If you see a space in the field name, remove it. Use "aadharCardPhoto" not "aadharCardPhoto "',
          });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size too large. Maximum size is 10MB',
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: `Too many files for field: ${err.field}`,
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
    next();
  });
};

const uploadDeliveryImageWithErrorHandling = (req, res, next) => {
  uploadDeliveryImage(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: `Unexpected field: "${err.field}". Allowed fields are: deliveryImage, deliveredImage`,
            receivedField: err.field,
            allowedFields: ['deliveryImage', 'deliveredImage'],
          });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size too large. Maximum size is 10MB',
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
    
    // Normalize file to req.file for single file uploads
    // Check both field names and set req.file to whichever is present
    if (req.files) {
      if (req.files.deliveryImage && req.files.deliveryImage[0]) {
        req.file = req.files.deliveryImage[0];
      } else if (req.files.deliveredImage && req.files.deliveredImage[0]) {
        req.file = req.files.deliveredImage[0];
      }
    }
    
    next();
  });
};

module.exports = { 
  uploadRiderFiles: uploadRiderFilesWithErrorHandling,
  uploadDeliveryImage: uploadDeliveryImageWithErrorHandling
};

