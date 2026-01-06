const SubCategory = require('../models/SubCategory');
const Category = require('../models/Category');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.createSubCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description, category } = req.body;

    const parentCategory = await Category.findById(category);
    if (!parentCategory) {
      return res.status(404).json({
        success: false,
        error: 'Parent category not found',
      });
    }

    const existingSubCategory = await SubCategory.findOne({ name, category });
    if (existingSubCategory) {
      return res.status(400).json({
        success: false,
        error: 'SubCategory with this name already exists in this category',
      });
    }

    let imageData = {};

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/subcategories');
        imageData = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    const subCategory = await SubCategory.create({
      name,
      description,
      category,
      image: imageData.url ? imageData : undefined,
      createdBy: req.admin._id,
    });

    // Increment subCategoryCount in the parent category
    await Category.findByIdAndUpdate(category, {
      $inc: { subCategoryCount: 1 },
    });

    const populatedSubCategory = await SubCategory.findById(subCategory._id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    logger.info(`SubCategory created: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(201).json({
      success: true,
      message: 'SubCategory created successfully',
      data: populatedSubCategory,
    });
  } catch (error) {
    logger.error('Create subcategory error:', error);
    next(error);
  }
};

exports.getSubCategories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.isActive;
    const category = req.query.category;

    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (category) {
      query.category = category;
    }

    const subCategories = await SubCategory.find(query)
      .populate('category', 'name')
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await SubCategory.countDocuments(query);

    res.status(200).json({
      success: true,
      count: subCategories.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: subCategories,
    });
  } catch (error) {
    logger.error('Get subcategories error:', error);
    next(error);
  }
};

exports.getSubCategory = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    res.status(200).json({
      success: true,
      data: subCategory,
    });
  } catch (error) {
    logger.error('Get subcategory error:', error);
    next(error);
  }
};

exports.updateSubCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    let subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    const { name, description, category } = req.body;

    // Store the old category ID before any updates
    const oldCategoryId = subCategory.category;

    if (category) {
      const parentCategory = await Category.findById(category);
      if (!parentCategory) {
        return res.status(404).json({
          success: false,
          error: 'Parent category not found',
        });
      }
    }

    if (name && (name !== subCategory.name || category !== subCategory.category)) {
      const existingSubCategory = await SubCategory.findOne({
        name,
        category: category || subCategory.category,
        _id: { $ne: subCategory._id },
      });
      if (existingSubCategory) {
        return res.status(400).json({
          success: false,
          error: 'SubCategory with this name already exists in this category',
        });
      }
    }

    // Handle category change - update counts
    if (category && category.toString() !== oldCategoryId.toString()) {
      // Decrement count in old category
      await Category.findByIdAndUpdate(oldCategoryId, {
        $inc: { subCategoryCount: -1 },
      });
      // Increment count in new category
      await Category.findByIdAndUpdate(category, {
        $inc: { subCategoryCount: 1 },
      });
    }

    if (name) subCategory.name = name;
    if (description !== undefined) subCategory.description = description;
    if (category) subCategory.category = category;

    if (req.file) {
      if (subCategory.image && subCategory.image.publicId) {
        try {
          await deleteFromCloudinary(subCategory.image.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old image:', deleteError);
        }
      }

      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/subcategories');
        subCategory.image = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    await subCategory.save();

    const populatedSubCategory = await SubCategory.findById(subCategory._id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    logger.info(`SubCategory updated: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'SubCategory updated successfully',
      data: populatedSubCategory,
    });
  } catch (error) {
    logger.error('Update subcategory error:', error);
    next(error);
  }
};

exports.deleteSubCategory = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    if (subCategory.image && subCategory.image.publicId) {
      try {
        await deleteFromCloudinary(subCategory.image.publicId);
      } catch (deleteError) {
        logger.error('Error deleting image from Cloudinary:', deleteError);
      }
    }

    // Store the category ID before deletion
    const categoryId = subCategory.category;

    await SubCategory.findByIdAndDelete(req.params.id);

    // Decrement subCategoryCount in the parent category
    await Category.findByIdAndUpdate(categoryId, {
      $inc: { subCategoryCount: -1 },
    });

    logger.info(`SubCategory deleted: ${subCategory.name} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'SubCategory deleted successfully',
    });
  } catch (error) {
    logger.error('Delete subcategory error:', error);
    next(error);
  }
};

exports.toggleSubCategoryStatus = async (req, res, next) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);

    if (!subCategory) {
      return res.status(404).json({
        success: false,
        error: 'SubCategory not found',
      });
    }

    subCategory.isActive = !subCategory.isActive;
    await subCategory.save();

    logger.info(`SubCategory status toggled: ${subCategory.name} to ${subCategory.isActive} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `SubCategory ${subCategory.isActive ? 'activated' : 'deactivated'} successfully`,
      data: subCategory,
    });
  } catch (error) {
    logger.error('Toggle subcategory status error:', error);
    next(error);
  }
};

exports.getSubCategoriesByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const isActive = req.query.isActive;

    let query = { category: categoryId };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const subCategories = await SubCategory.find(query)
      .populate('category', 'name')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: subCategories.length,
      data: subCategories,
    });
  } catch (error) {
    logger.error('Get subcategories by category error:', error);
    next(error);
  }
};

