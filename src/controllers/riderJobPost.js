const RiderJobPost = require('../models/RiderJobPost');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');

// Create job post - Only Vendor can post
exports.createJobPost = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Only vendors can create job posts
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can create job posts',
      });
    }

    // Ensure vendor is active
    if (!req.vendor.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Your vendor account is deactivated',
      });
    }

    const { 
      jobTitle, 
      joiningBonus, 
      onboardingFee, 
      locationLine1,
      locationLine2,
      locationPinCode,
      locationCity,
      locationState,
      locationLatitude,
      locationLongitude,
    } = req.body;

    // Vendor is always saved from logged-in vendor credentials
    const vendorId = req.vendor._id;
    const postedBy = req.vendor._id;
    const postedByType = 'Vendor';

    // Ensure no vendor field is passed in request body (vendor comes from credentials only)
    if (req.body.vendor) {
      return res.status(400).json({
        success: false,
        error: 'Vendor cannot be specified. It is automatically set from your credentials.',
      });
    }

    // Validate and process location data
    if (!locationLine1 || !locationPinCode) {
      return res.status(400).json({
        success: false,
        error: 'Location address line 1 and PIN code are required',
      });
    }

    // Get city and state from PIN code if not provided
    let city = locationCity;
    let state = locationState;

    if (!city || !state) {
      const postOfficeData = await getPostOfficeDetails(locationPinCode);
      if (!postOfficeData.success) {
        return res.status(400).json({
          success: false,
          error: postOfficeData.error || 'Invalid PIN code',
        });
      }
      city = city || postOfficeData.city;
      state = state || postOfficeData.state;
    }

    const location = {
      line1: locationLine1,
      line2: locationLine2 || '',
      pinCode: locationPinCode,
      city: city,
      state: state,
      latitude: locationLatitude ? parseFloat(locationLatitude) : undefined,
      longitude: locationLongitude ? parseFloat(locationLongitude) : undefined,
    };

    const jobPost = await RiderJobPost.create({
      jobTitle,
      joiningBonus,
      onboardingFee,
      vendor: vendorId,
      postedBy,
      postedByType,
      location,
    });

    // Populate vendor and postedBy (always vendor since only vendors can post)
    const populatedJobPost = await RiderJobPost.findById(jobPost._id)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('postedBy', 'vendorName storeName contactNumber email');

    logger.info(`Rider job post created: ${jobTitle} by Vendor: ${req.vendor.email || req.vendor.contactNumber}`);

    res.status(201).json({
      success: true,
      message: 'Job post created successfully',
      data: populatedJobPost,
    });
  } catch (error) {
    logger.error('Create rider job post error:', error);
    next(error);
  }
};

// Get all job posts
exports.getJobPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.isActive;
    const vendor = req.query.vendor;
    const city = req.query.city;
    const state = req.query.state;
    const pinCode = req.query.pinCode;
    const search = req.query.search; // General search parameter

    let query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (vendor) {
      query.vendor = vendor;
    }

    // If vendor is requesting, only show their own posts
    if (req.vendor) {
      query.vendor = req.vendor._id;
    }

    // Location-based filtering
    // If city is passed as query param, use it directly
    if (city) {
      // Case-insensitive partial match for city using MongoDB $regex
      // Escape special regex characters and trim whitespace
      const citySearch = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['location.city'] = { $regex: citySearch, $options: 'i' };
    }
    
    if (state) {
      // Case-insensitive partial match for state using MongoDB $regex
      query['location.state'] = { $regex: state.trim(), $options: 'i' };
    }
    
    if (pinCode) {
      query['location.pinCode'] = pinCode.trim();
    }

    // General search - searches in city, state, address, or PIN code
    // Works even if city parameter is not explicitly passed
    if (search) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const searchConditions = [
        { 'location.city': searchRegex },
        { 'location.state': searchRegex },
        { 'location.line1': searchRegex },
      ];
      
      // Also try exact PIN code match if search is 6 digits
      if (/^\d{6}$/.test(search.trim())) {
        searchConditions.push({ 'location.pinCode': search.trim() });
      }
      
      // If we have specific location filters (city, state, pinCode), combine them with $and
      const locationFilters = {};
      if (query['location.city']) {
        locationFilters['location.city'] = query['location.city'];
        delete query['location.city'];
      }
      if (query['location.state']) {
        locationFilters['location.state'] = query['location.state'];
        delete query['location.state'];
      }
      if (query['location.pinCode']) {
        locationFilters['location.pinCode'] = query['location.pinCode'];
        delete query['location.pinCode'];
      }
      
      if (Object.keys(locationFilters).length > 0) {
        // Combine location filters with search using $and
        query['$and'] = [
          locationFilters,
          { $or: searchConditions }
        ];
      } else {
        // Just use search
        query['$or'] = searchConditions;
      }
    }
    
    // Log the query for debugging
    logger.info('Job posts query:', JSON.stringify(query, null, 2));

    const jobPosts = await RiderJobPost.find(query)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('postedBy')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await RiderJobPost.countDocuments(query);

    res.status(200).json({
      success: true,
      count: jobPosts.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: jobPosts,
    });
  } catch (error) {
    logger.error('Get job posts error:', error);
    next(error);
  }
};

// Get single job post
exports.getJobPost = async (req, res, next) => {
  try {
    const jobPost = await RiderJobPost.findById(req.params.id)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('postedBy');

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    // If vendor is requesting, ensure they can only see their own posts
    if (req.vendor && jobPost.vendor._id.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own job posts.',
      });
    }

    res.status(200).json({
      success: true,
      data: jobPost,
    });
  } catch (error) {
    logger.error('Get job post error:', error);
    next(error);
  }
};

// Update job post
exports.updateJobPost = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    let jobPost = await RiderJobPost.findById(req.params.id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    // Only vendors can update job posts
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can update job posts',
      });
    }

    // Vendor can only update their own posts
    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own job posts.',
      });
    }

    const { 
      jobTitle, 
      joiningBonus, 
      onboardingFee, 
      locationLine1,
      locationLine2,
      locationPinCode,
      locationCity,
      locationState,
      locationLatitude,
      locationLongitude,
    } = req.body;

    // Ensure vendor cannot be changed (vendor comes from credentials only)
    if (req.body.vendor) {
      return res.status(400).json({
        success: false,
        error: 'Vendor cannot be changed. It is set from your credentials.',
      });
    }

    if (jobTitle) jobPost.jobTitle = jobTitle;
    if (joiningBonus !== undefined) jobPost.joiningBonus = joiningBonus;
    if (onboardingFee !== undefined) jobPost.onboardingFee = onboardingFee;

    // Handle location updates
    if (locationLine1 || locationPinCode) {
      const pinCode = locationPinCode || jobPost.location.pinCode;
      let city = locationCity;
      let state = locationState;

      // If PIN code is being updated or city/state not provided, fetch from API
      if (locationPinCode && (!city || !state)) {
        const postOfficeData = await getPostOfficeDetails(pinCode);
        if (!postOfficeData.success) {
          return res.status(400).json({
            success: false,
            error: postOfficeData.error || 'Invalid PIN code',
          });
        }
        city = city || postOfficeData.city;
        state = state || postOfficeData.state;
      } else if (!city || !state) {
        // Use existing city/state if not provided
        city = city || jobPost.location.city;
        state = state || jobPost.location.state;
      }

      jobPost.location = {
        line1: locationLine1 || jobPost.location.line1,
        line2: locationLine2 !== undefined ? locationLine2 : jobPost.location.line2,
        pinCode: pinCode,
        city: city,
        state: state,
        latitude: locationLatitude !== undefined ? parseFloat(locationLatitude) : jobPost.location.latitude,
        longitude: locationLongitude !== undefined ? parseFloat(locationLongitude) : jobPost.location.longitude,
      };
    }

    await jobPost.save();

    const populatedJobPost = await RiderJobPost.findById(jobPost._id)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('postedBy', 'vendorName storeName contactNumber email');

    logger.info(`Job post updated: ${jobPost._id} by Vendor: ${req.vendor.email}`);

    res.status(200).json({
      success: true,
      message: 'Job post updated successfully',
      data: populatedJobPost,
    });
  } catch (error) {
    logger.error('Update job post error:', error);
    next(error);
  }
};

// Delete job post
exports.deleteJobPost = async (req, res, next) => {
  try {
    const jobPost = await RiderJobPost.findById(req.params.id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    // Only vendors can delete job posts
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can delete job posts',
      });
    }

    // Vendor can only delete their own posts
    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only delete your own job posts.',
      });
    }

    await RiderJobPost.findByIdAndDelete(req.params.id);

    logger.info(`Job post deleted: ${jobPost._id} by Vendor: ${req.vendor.email}`);

    res.status(200).json({
      success: true,
      message: 'Job post deleted successfully',
    });
  } catch (error) {
    logger.error('Delete job post error:', error);
    next(error);
  }
};

// Toggle job post status
exports.toggleJobPostStatus = async (req, res, next) => {
  try {
    const jobPost = await RiderJobPost.findById(req.params.id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    // Only vendors can toggle job post status
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can toggle job post status',
      });
    }

    // Vendor can only toggle their own posts
    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only toggle your own job posts.',
      });
    }

    jobPost.isActive = !jobPost.isActive;
    await jobPost.save();

    logger.info(`Job post status toggled: ${jobPost._id} to ${jobPost.isActive} by Vendor: ${req.vendor.email || req.vendor.contactNumber}`);

    res.status(200).json({
      success: true,
      message: `Job post ${jobPost.isActive ? 'activated' : 'deactivated'} successfully`,
      data: jobPost,
    });
  } catch (error) {
    logger.error('Toggle job post status error:', error);
    next(error);
  }
};

