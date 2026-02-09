const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    sparse: true,
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Category name cannot be more than 100 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters'],
  },
  image: {
    url: String,
    publicId: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  subCategoryCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Generate unique code before saving
CategorySchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  
  // Generate code if it doesn't exist
  if (!this.code) {
    let codeExists = true;
    let codeNumber = 1;
    let code;
    
    while (codeExists) {
      code = `CAT${String(codeNumber).padStart(6, '0')}`;
      const existingCategory = await mongoose.model('Category').findOne({ code });
      if (!existingCategory) {
        codeExists = false;
        this.code = code;
      } else {
        codeNumber++;
      }
    }
  }
  
  next();
});

CategorySchema.index({ code: 1 });
CategorySchema.index({ isActive: 1 });
CategorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Category', CategorySchema);

