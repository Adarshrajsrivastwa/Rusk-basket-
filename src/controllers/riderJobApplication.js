const RiderJobApplication = require('../models/RiderJobApplication');
const RiderJobPost = require('../models/RiderJobPost');
const Rider = require('../models/Rider');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

// Rider applies for a job
exports.applyForJob = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Only riders can apply
    if (!req.rider) {
      return res.status(403).json({
        success: false,
        error: 'Only riders can apply for jobs',
      });
    }

    const { jobPostId } = req.body;

    // Check if job post exists and is active
    const jobPost = await RiderJobPost.findById(jobPostId);
    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    if (!jobPost.isActive) {
      return res.status(400).json({
        success: false,
        error: 'This job post is not active',
      });
    }

    // Check if rider has already applied
    const existingApplication = await RiderJobApplication.findOne({
      jobPost: jobPostId,
      rider: req.rider._id,
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        error: 'You have already applied for this job',
      });
    }

    // Create application
    const application = await RiderJobApplication.create({
      jobPost: jobPostId,
      rider: req.rider._id,
      status: 'pending',
    });

    const populatedApplication = await RiderJobApplication.findById(application._id)
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee location')
      .populate('rider', 'fullName mobileNumber');

    logger.info(`Rider ${req.rider.mobileNumber} applied for job post: ${jobPostId}`);

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: populatedApplication,
    });
  } catch (error) {
    logger.error('Apply for job error:', error);
    next(error);
  }
};

// Get rider's applications
exports.getMyApplications = async (req, res, next) => {
  try {
    // Only riders can view their applications
    if (!req.rider) {
      return res.status(403).json({
        success: false,
        error: 'Only riders can view their applications',
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = { rider: req.rider._id };
    if (status) {
      query.status = status;
    }

    const applications = await RiderJobApplication.find(query)
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee location vendor isActive')
      .populate('jobPost.vendor', 'vendorName storeName')
      .populate('reviewedBy', 'vendorName storeName')
      .skip(skip)
      .limit(limit)
      .sort({ appliedAt: -1 });

    const total = await RiderJobApplication.countDocuments(query);

    res.status(200).json({
      success: true,
      count: applications.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: applications,
    });
  } catch (error) {
    logger.error('Get my applications error:', error);
    next(error);
  }
};

// Get applications for a job post (vendor only)
exports.getJobApplications = async (req, res, next) => {
  try {
    // Only vendors can view applications for their job posts
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can view job applications',
      });
    }

    const { jobPostId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(jobPostId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job post ID format',
      });
    }

    // Verify job post belongs to this vendor
    const jobPost = await RiderJobPost.findById(jobPostId);
    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view applications for your own job posts.',
      });
    }

    let query = { jobPost: jobPostId };
    if (status) {
      query.status = status;
    }

    const applications = await RiderJobApplication.find(query)
      .populate('rider', 'fullName mobileNumber email city currentAddress approvalStatus')
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee')
      .populate('reviewedBy', 'vendorName storeName')
      .populate('assignedBy', 'vendorName storeName')
      .skip(skip)
      .limit(limit)
      .sort({ appliedAt: -1 });

    const total = await RiderJobApplication.countDocuments(query);

    res.status(200).json({
      success: true,
      count: applications.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: applications,
    });
  } catch (error) {
    logger.error('Get job applications error:', error);
    next(error);
  }
};

// Vendor approves/rejects application
exports.reviewApplication = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Only vendors can review applications
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can review applications',
      });
    }

    const { applicationId } = req.params;
    const { status, rejectionReason } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid application ID format',
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be either "approved" or "rejected"',
      });
    }

    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required when rejecting an application',
      });
    }

    const application = await RiderJobApplication.findById(applicationId)
      .populate('jobPost');

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    // Verify job post belongs to this vendor
    if (application.jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only review applications for your own job posts.',
      });
    }

    // Check if already reviewed
    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `This application has already been ${application.status}`,
      });
    }

    // Update application
    application.status = status;
    application.reviewedBy = req.vendor._id;
    application.reviewedAt = new Date();
    if (status === 'rejected' && rejectionReason) {
      application.rejectionReason = rejectionReason;
    }

    await application.save();

    const populatedApplication = await RiderJobApplication.findById(application._id)
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee')
      .populate('rider', 'fullName mobileNumber')
      .populate('reviewedBy', 'vendorName storeName');

    logger.info(`Application ${applicationId} ${status} by vendor ${req.vendor.email}`);

    res.status(200).json({
      success: true,
      message: `Application ${status} successfully`,
      data: populatedApplication,
    });
  } catch (error) {
    logger.error('Review application error:', error);
    next(error);
  }
};

// Get single application
exports.getApplication = async (req, res, next) => {
  try {
    const { applicationId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid application ID format',
      });
    }

    const application = await RiderJobApplication.findById(applicationId)
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee location vendor')
      .populate('jobPost.vendor', 'vendorName storeName')
      .populate('rider', 'fullName mobileNumber email city currentAddress')
      .populate('reviewedBy', 'vendorName storeName');

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    // Check permissions
    if (req.rider) {
      // Rider can only view their own applications
      if (application.rider._id.toString() !== req.rider._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only view your own applications.',
        });
      }
    } else if (req.vendor) {
      // Vendor can only view applications for their job posts
      if (application.jobPost.vendor.toString() !== req.vendor._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only view applications for your own job posts.',
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized access',
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    logger.error('Get application error:', error);
    next(error);
  }
};

// Vendor assigns rider to job (rider must be approved first)
exports.assignRider = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Only vendors can assign riders
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can assign riders',
      });
    }

    const { applicationId } = req.params;
    const { assignmentNotes } = req.body;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid application ID format',
      });
    }

    const application = await RiderJobApplication.findById(applicationId)
      .populate('jobPost')
      .populate('rider');

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    // Verify job post belongs to this vendor
    if (application.jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only assign riders for your own job posts.',
      });
    }

    // Check if application is approved
    if (application.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot assign rider. Application status must be "approved". Current status: ${application.status}`,
      });
    }

    // Check if already assigned
    if (application.status === 'assigned') {
      return res.status(400).json({
        success: false,
        error: 'This rider has already been assigned to this job',
      });
    }

    // Check if rider is active
    if (!application.rider.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot assign inactive rider',
      });
    }

    // Update application to assigned status
    application.status = 'assigned';
    application.assignedBy = req.vendor._id;
    application.assignedAt = new Date();
    if (assignmentNotes) {
      application.assignmentNotes = assignmentNotes;
    }

    await application.save();

    const populatedApplication = await RiderJobApplication.findById(application._id)
      .populate('jobPost', 'jobTitle joiningBonus onboardingFee location')
      .populate('rider', 'fullName mobileNumber email city currentAddress')
      .populate('assignedBy', 'vendorName storeName contactNumber email')
      .populate('reviewedBy', 'vendorName storeName');

    logger.info(`Rider ${application.rider.mobileNumber} assigned to job post ${application.jobPost._id} by vendor ${req.vendor.email || req.vendor.contactNumber}`);

    res.status(200).json({
      success: true,
      message: 'Rider assigned successfully',
      data: populatedApplication,
    });
  } catch (error) {
    logger.error('Assign rider error:', error);
    next(error);
  }
};

// Get assigned riders for a job post (vendor only)
exports.getAssignedRiders = async (req, res, next) => {
  try {
    // Only vendors can view assigned riders
    if (!req.vendor) {
      return res.status(403).json({
        success: false,
        error: 'Only vendors can view assigned riders',
      });
    }

    const { jobPostId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(jobPostId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job post ID format',
      });
    }

    // Verify job post belongs to this vendor
    const jobPost = await RiderJobPost.findById(jobPostId);
    if (!jobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found',
      });
    }

    if (jobPost.vendor.toString() !== req.vendor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view assigned riders for your own job posts.',
      });
    }

    const applications = await RiderJobApplication.find({
      jobPost: jobPostId,
      status: 'assigned',
    })
      .populate('rider', 'fullName mobileNumber email city currentAddress approvalStatus')
      .populate('assignedBy', 'vendorName storeName')
      .skip(skip)
      .limit(limit)
      .sort({ assignedAt: -1 });

    const total = await RiderJobApplication.countDocuments({
      jobPost: jobPostId,
      status: 'assigned',
    });

    res.status(200).json({
      success: true,
      count: applications.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: applications,
    });
  } catch (error) {
    logger.error('Get assigned riders error:', error);
    next(error);
  }
};

