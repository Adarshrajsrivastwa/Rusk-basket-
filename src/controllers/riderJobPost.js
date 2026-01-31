const RiderJobPost = require('../models/RiderJobPost');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { getPostOfficeDetails } = require('../utils/postOfficeAPI');

exports.createJobPost = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const isVendor = !!req.vendor;
    const isAdmin = !!req.admin;

    if (!isVendor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors or admins can create job posts',
      });
    }

    if (isVendor && !req.vendor.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Your vendor account is deactivated',
      });
    }

    const { 
      jobTitle, 
      joiningBonus, 
      onboardingFee, 
      vendor: vendorIdFromBody,
      locationLine1,
      locationLine2,
      locationPinCode,
      locationCity,
      locationState,
      locationLatitude,
      locationLongitude,
    } = req.body;

    let vendorId;
    let postedBy;
    let postedByType;

    if (isAdmin) {
      if (!vendorIdFromBody) {
        return res.status(400).json({
          success: false,
          error: 'Vendor ID is required when creating job post as admin',
        });
      }

      const selectedVendor = await Vendor.findById(vendorIdFromBody);
      if (!selectedVendor) {
        return res.status(404).json({
          success: false,
          error: 'Selected vendor not found',
        });
      }

      if (!selectedVendor.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Selected vendor account is deactivated',
        });
      }

      if (!selectedVendor.storeId) {
        return res.status(400).json({
          success: false,
          error: 'Selected vendor registration is not completed',
        });
      }

      vendorId = vendorIdFromBody;
      postedBy = req.admin._id;
      postedByType = 'Admin';
    } else {
      vendorId = req.vendor._id;
      postedBy = req.vendor._id;
      postedByType = 'Vendor';

      if (vendorIdFromBody) {
        return res.status(400).json({
          success: false,
          error: 'Vendor cannot be specified. It is automatically set from your credentials.',
        });
      }
    }

      if (!locationLine1 || !locationPinCode) {
      return res.status(400).json({
        success: false,
        error: 'Location address line 1 and PIN code are required',
      });
    }

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

    const populatedJobPost = await RiderJobPost.findById(jobPost._id)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate({
        path: 'postedBy',
        select: 'name email mobile vendorName storeName contactNumber',
      });

    res.status(201).json({
      success: true,
      message: 'Job post created successfully',
      data: populatedJobPost,
    });
  } catch (error) {
    next(error);
  }
};

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
    const search = req.query.search;

    const isAdmin = !!req.admin;
    const isVendor = !!req.vendor;

    let query = {};

    // If vendor is authenticated, only show their job posts
    if (isVendor) {
      query.vendor = req.vendor._id;
    } else if (isAdmin && vendor) {
      if (!mongoose.Types.ObjectId.isValid(vendor)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid vendor ID format',
        });
      }
      const vendorExists = await Vendor.findById(vendor);
      if (!vendorExists) {
        return res.status(404).json({
          success: false,
          error: 'Vendor not found',
        });
      }
      query.vendor = vendor;
    } else if (vendor && !isAdmin && !isVendor) {
      if (!mongoose.Types.ObjectId.isValid(vendor)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid vendor ID format',
        });
      }
      query.vendor = vendor;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else if (!isAdmin && !isVendor) {
      query.isActive = true;
    }

    if (city) {
      const citySearch = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['location.city'] = { $regex: citySearch, $options: 'i' };
    }
    
    if (state) {
      query['location.state'] = { $regex: state.trim(), $options: 'i' };
    }
    
    if (pinCode) {
      query['location.pinCode'] = pinCode.trim();
    }

    if (search) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const searchConditions = [
        { 'location.city': searchRegex },
        { 'location.state': searchRegex },
        { 'location.line1': searchRegex },
      ];
      
      if (/^\d{6}$/.test(search.trim())) {
        searchConditions.push({ 'location.pinCode': search.trim() });
      }
      
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
        query['$and'] = [
          locationFilters,
          { $or: searchConditions }
        ];
      } else {
        query['$or'] = searchConditions;
      }
    }

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
    next(error);
  }
};

exports.getMyJobPosts = async (req, res, next) => {
  try {
    // This endpoint is specifically for vendors to get their own job posts
    // Vendor ID is extracted from the JWT token via protectVendor middleware
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can access this endpoint',
      });
    }

    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Query only job posts for this vendor
    const query = {
      vendor: vendorId,
    };

    // Optional: filter by active status
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    // Optional: search by job title
    if (req.query.search) {
      query.jobTitle = { $regex: req.query.search.trim(), $options: 'i' };
    }

    // Optional: filter by location
    if (req.query.city) {
      query['location.city'] = { $regex: req.query.city.trim(), $options: 'i' };
    }
    
    if (req.query.state) {
      query['location.state'] = { $regex: req.query.state.trim(), $options: 'i' };
    }
    
    if (req.query.pinCode) {
      query['location.pinCode'] = req.query.pinCode.trim();
    }

    const jobPosts = await RiderJobPost.find(query)
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate({
        path: 'postedBy',
        select: 'name email mobile vendorName storeName contactNumber',
      })
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
    next(error);
  }
};

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
    next(error);
  }
};

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

    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can update job posts',
      });
    }

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

    if (req.body.vendor) {
      return res.status(400).json({
        success: false,
        error: 'Vendor cannot be changed. It is set from your credentials.',
      });
    }

    if (jobTitle) jobPost.jobTitle = jobTitle;
    if (joiningBonus !== undefined) jobPost.joiningBonus = joiningBonus;
    if (onboardingFee !== undefined) jobPost.onboardingFee = onboardingFee;

    if (locationLine1 || locationPinCode) {
      const pinCode = locationPinCode || jobPost.location.pinCode;
      let city = locationCity;
      let state = locationState;

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

    res.status(200).json({
      success: true,
      message: 'Job post updated successfully',
      data: populatedJobPost,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteJobPost = async (req, res, next) => {
  try {
    const jobPost = await RiderJobPost.findById(req.params.id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can delete job posts',
      });
    }

    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only delete your own job posts.',
      });
    }

    await RiderJobPost.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Job post deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleJobPostStatus = async (req, res, next) => {
  try {
    const jobPost = await RiderJobPost.findById(req.params.id);

    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can toggle job post status',
      });
    }

    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only toggle your own job posts.',
      });
    }

    jobPost.isActive = !jobPost.isActive;
    await jobPost.save();

    res.status(200).json({
      success: true,
      message: `Job post ${jobPost.isActive ? 'activated' : 'deactivated'} successfully`,
      data: jobPost,
    });
  } catch (error) {
    next(error);
  }
};

