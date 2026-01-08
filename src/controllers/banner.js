const Banner = require('../models/Banner');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.createBanner = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { name } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Banner image is required',
      });
    }

    // Check if banner with same name exists (only if name is provided)
    if (name && name.trim()) {
      const existingBanner = await Banner.findOne({ name: name.trim() });
      if (existingBanner) {
        return res.status(400).json({
          success: false,
          error: 'Banner with this name already exists',
        });
      }
    }

    // Validate Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      logger.error('Cloudinary configuration missing');
      return res.status(500).json({
        success: false,
        error: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment variables.',
      });
    }

    // Upload image to Cloudinary
    let imageData = {};
    try {
      logger.info('Uploading banner image to Cloudinary...');
      const uploadResult = await uploadToCloudinary(req.file, 'rush-basket/banners');
      
      if (!uploadResult || !uploadResult.url || !uploadResult.publicId) {
        throw new Error('Invalid upload result from Cloudinary');
      }
      
      imageData = {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
      };
      
      logger.info(`Banner image uploaded successfully to Cloudinary: ${uploadResult.publicId}`);
      logger.info(`Banner image URL: ${uploadResult.url}`);
    } catch (uploadError) {
      logger.error('Cloudinary upload error:', uploadError);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload banner image to Cloudinary. Please try again.',
        details: uploadError.message,
      });
    }

    // Create banner with Cloudinary image data
    const banner = await Banner.create({
      name: name ? name.trim() : undefined,
      image: imageData,
      createdBy: req.admin._id,
    });

    const populatedBanner = await Banner.findById(banner._id)
      .populate('createdBy', 'name email');

    logger.info(`Banner created: ${banner.name} by Admin: ${req.admin.email}`);

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: populatedBanner,
    });
  } catch (error) {
    logger.error('Create banner error:', error);
    next(error);
  }
};

exports.getBanners = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.isActive;

    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      // Default: only show active banners for public access
      if (!req.admin) {
        query.isActive = true;
      }
    }

    const banners = await Banner.find(query)
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Banner.countDocuments(query);

    res.status(200).json({
      success: true,
      count: banners.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: banners,
    });
  } catch (error) {
    logger.error('Get banners error:', error);
    next(error);
  }
};

exports.getBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found',
      });
    }

    // If not admin, only show active banners
    if (!req.admin && !banner.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found',
      });
    }

    res.status(200).json({
      success: true,
      data: banner,
    });
  } catch (error) {
    logger.error('Get banner error:', error);
    next(error);
  }
};

exports.deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found',
      });
    }

    // Delete image from Cloudinary
    if (banner.image && banner.image.publicId) {
      try {
        await deleteFromCloudinary(banner.image.publicId);
      } catch (deleteError) {
        logger.error('Error deleting banner image from Cloudinary:', deleteError);
      }
    }

    await Banner.findByIdAndDelete(req.params.id);

    logger.info(`Banner deleted: ${banner.name} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully',
    });
  } catch (error) {
    logger.error('Delete banner error:', error);
    next(error);
  }
};

exports.toggleBannerStatus = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found',
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    logger.info(`Banner status toggled: ${banner.name} to ${banner.isActive} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
      data: banner,
    });
  } catch (error) {
    logger.error('Toggle banner status error:', error);
    next(error);
  }
};

