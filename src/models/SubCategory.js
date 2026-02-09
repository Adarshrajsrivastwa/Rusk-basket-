const mongoose = require('mongoose');

const SubCategorySchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    sparse: true,
  },
  name: {
    type: String,
    required: [true, 'SubCategory name is required'],
    trim: true,
    maxlength: [100, 'SubCategory name cannot be more than 100 characters'],
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
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Parent category is required'],
  },
  isActive: {
    type: Boolean,
    default: true,
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
SubCategorySchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  
  // Generate code if it doesn't exist
  if (!this.code) {
    let codeExists = true;
    let codeNumber = 1;
    let code;
    
    while (codeExists) {
      code = `SUB${String(codeNumber).padStart(6, '0')}`;
      const existingSubCategory = await mongoose.model('SubCategory').findOne({ code });
      if (!existingSubCategory) {
        codeExists = false;
        this.code = code;
      } else {
        codeNumber++;
      }
    }
  }
  
  next();
});

SubCategorySchema.index({ code: 1 });
SubCategorySchema.index({ category: 1 });
SubCategorySchema.index({ isActive: 1 });
SubCategorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('SubCategory', SubCategorySchema);

