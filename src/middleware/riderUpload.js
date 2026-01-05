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

module.exports = { uploadRiderFiles: uploadRiderFilesWithErrorHandling };

