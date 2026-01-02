const Category = require('../models/Category');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.createCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name, description } = req.body;

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: 'Category with this name already exists',
      });
    }

    let imageData = {};

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/categories');
        imageData = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    const category = await Category.create({
      name,
      description,
      image: imageData.url ? imageData : undefined,
      createdBy: req.superadmin._id,
    });

    const populatedCategory = await Category.findById(category._id).populate('createdBy', 'name email');

    logger.info(`Category created: ${category.name} by SuperAdmin: ${req.superadmin.email}`);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: populatedCategory,
    });
  } catch (error) {
    logger.error('Create category error:', error);
    next(error);
  }
};

exports.getCategories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.isActive;

    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const categories = await Category.find(query)
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Category.countDocuments(query);

    res.status(200).json({
      success: true,
      count: categories.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: categories,
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    next(error);
  }
};

exports.getCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id).populate('createdBy', 'name email');

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    logger.error('Get category error:', error);
    next(error);
  }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    let category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    const { name, description } = req.body;

    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          error: 'Category with this name already exists',
        });
      }
    }

    if (name) category.name = name;
    if (description !== undefined) category.description = description;

    if (req.file) {
      if (category.image && category.image.publicId) {
        try {
          await deleteFromCloudinary(category.image.publicId);
        } catch (deleteError) {
          logger.error('Error deleting old image:', deleteError);
        }
      }

      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/categories');
        category.image = uploadResult;
      } catch (uploadError) {
        logger.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Failed to upload image',
        });
      }
    }

    await category.save();

    const populatedCategory = await Category.findById(category._id).populate('createdBy', 'name email');

    logger.info(`Category updated: ${category.name} by SuperAdmin: ${req.superadmin.email}`);

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: populatedCategory,
    });
  } catch (error) {
    logger.error('Update category error:', error);
    next(error);
  }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    if (category.image && category.image.publicId) {
      try {
        await deleteFromCloudinary(category.image.publicId);
      } catch (deleteError) {
        logger.error('Error deleting image from Cloudinary:', deleteError);
      }
    }

    await Category.findByIdAndDelete(req.params.id);

    logger.info(`Category deleted: ${category.name} by SuperAdmin: ${req.superadmin.email}`);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    logger.error('Delete category error:', error);
    next(error);
  }
};

exports.toggleCategoryStatus = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    logger.info(`Category status toggled: ${category.name} to ${category.isActive} by SuperAdmin: ${req.superadmin.email}`);

    res.status(200).json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: category,
    });
  } catch (error) {
    logger.error('Toggle category status error:', error);
    next(error);
  }
};

