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
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: fileFilter,
});

const uploadFields = upload.fields([
  { name: 'storeImage', maxCount: 10 },
  { name: 'storeImage[]', maxCount: 10 },
  { name: 'panImage', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'panCard ', maxCount: 1 },
  { name: ' panCard', maxCount: 1 },
  { name: 'aadhaarImage', maxCount: 1 },
  { name: 'aadharImage', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'aadharCard ', maxCount: 1 },
  { name: ' aadharCard', maxCount: 1 },
  { name: 'aadhaarCard', maxCount: 1 },
  { name: 'cancelCheque', maxCount: 1 },
  { name: 'cancelCheque ', maxCount: 1 },
]);

const uploadFieldsWithErrorHandling = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          const allowedFields = ['storeImage', 'storeImage[]', 'panImage', 'panCard', 'aadhaarImage', 'aadharImage', 'aadharCard', 'aadhaarCard', 'cancelCheque'];
          return res.status(400).json({
            success: false,
            error: `Unexpected field: "${err.field}". Allowed fields are: ${allowedFields.join(', ')}. Please ensure field names match exactly (no extra spaces).`,
            receivedField: err.field,
            allowedFields: allowedFields,
            hint: 'If you see a space in the field name, remove it. Use "panCard" not "panCard "',
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

module.exports = { uploadFields: uploadFieldsWithErrorHandling };

