const Category = require('../models/Category');
const Product = require('../models/Product');
const SubCategory = require('../models/SubCategory');
const Order = require('../models/Order');
const mongoose = require('mongoose');
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
      createdBy: req.admin._id,
    });

    const populatedCategory = await Category.findById(category._id).populate('createdBy', 'name email');

    logger.info(`Category created: ${category.name} by Admin: ${req.admin.email}`);

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
      .sort({ createdAt: -1 })
      .lean();

    // Get total product count for each category
    const categoriesWithProductCount = await Promise.all(
      categories.map(async (category) => {
        const totalProducts = await Product.countDocuments({ category: category._id });
        return {
          ...category,
          totalProducts,
        };
      })
    );

    const total = await Category.countDocuments(query);

    res.status(200).json({
      success: true,
      count: categoriesWithProductCount.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: categoriesWithProductCount,
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    next(error);
  }
};

exports.getCategory = async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category ID',
      });
    }

    // Get category with populated createdBy
    const category = await Category.findById(categoryId).populate('createdBy', 'name email').lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found',
      });
    }

    // Get summary statistics
    const [totalProducts, subCategoriesCount, subCategories] = await Promise.all([
      Product.countDocuments({ 
        category: categoryId,
        approvalStatus: 'approved',
        isActive: true 
      }),
      SubCategory.countDocuments({ 
        category: categoryId,
        isActive: true 
      }),
      SubCategory.find({ 
        category: categoryId,
        isActive: true 
      })
        .select('name _id')
        .sort({ createdAt: 1 })
        .lean()
    ]);

    // Get top selling products by aggregating from orders
    const topSellingProducts = await Order.aggregate([
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.product': { $exists: true },
          status: { $in: ['delivered', 'confirmed', 'processing', 'ready', 'out_for_delivery'] }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      {
        $unwind: '$productDetails'
      },
      {
        $match: {
          'productDetails.category': new mongoose.Types.ObjectId(categoryId),
          'productDetails.approvalStatus': 'approved',
          'productDetails.isActive': true
        }
      },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$productDetails.productName' },
          totalSales: { $sum: '$items.quantity' },
          stock: { $first: '$productDetails.inventory' }
        }
      },
      {
        $sort: { totalSales: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          sales: '$totalSales',
          stock: 1
        }
      }
    ]);

    // Format top selling products with rank
    const formattedTopProducts = topSellingProducts.map((product, index) => ({
      rank: index + 1,
      productId: product._id,
      productName: product.productName,
      sales: product.sales,
      stock: product.stock
    }));

    // Format sub categories with numbers
    const formattedSubCategories = subCategories.map((subCat, index) => ({
      _id: subCat._id,
      name: subCat.name,
      number: index + 1
    }));

    // Format dates
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Build response
    const response = {
      success: true,
      data: {
        category: {
          _id: category._id,
          name: category.name,
          description: category.description,
          image: category.image,
          isActive: category.isActive,
          createdBy: category.createdBy,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt
        },
        summary: {
          totalProducts,
          subCategoriesCount,
          created: formatDate(category.createdAt),
          lastUpdated: formatDate(category.updatedAt)
        },
        topSellingProducts: formattedTopProducts,
        subCategories: formattedSubCategories
      }
    };

    res.status(200).json(response);
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

    logger.info(`Category updated: ${category.name} by Admin: ${req.admin.email}`);

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

    logger.info(`Category deleted: ${category.name} by Admin: ${req.admin.email}`);

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

    logger.info(`Category status toggled: ${category.name} to ${category.isActive} by Admin: ${req.admin.email}`);

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

