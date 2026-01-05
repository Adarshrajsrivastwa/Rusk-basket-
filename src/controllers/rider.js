const Rider = require('../models/Rider');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { updateRiderProfileData } = require('../services/riderService');

exports.getProfile = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.rider._id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error('Get rider profile error:', error);
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const rider = await Rider.findById(req.rider._id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!rider.mobileNumberVerified) {
      return res.status(400).json({
        success: false,
        error: 'Please verify your mobile number first',
      });
    }

    // If profile is being updated and approval status is pending, keep it pending
    // If already approved/rejected, don't change approval status
    const previousApprovalStatus = rider.approvalStatus;

    await updateRiderProfileData(rider, req.body, req.files);
    
    // If updating profile, set status to pending for re-approval
    if (previousApprovalStatus === 'approved' || previousApprovalStatus === 'rejected') {
      rider.approvalStatus = 'pending';
      rider.approvedBy = undefined;
      rider.approvedAt = undefined;
      rider.rejectionReason = undefined;
    }

    await rider.save();

    logger.info(`Rider profile updated: ${rider.mobileNumber} (ID: ${rider._id})`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully. Status set to pending for approval.',
      data: rider,
    });
  } catch (error) {
    logger.error('Update rider profile error:', error);
    if (error.message === 'Invalid PIN code' || error.message.includes('PIN code')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes('language format') || error.message.includes('work details format')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

// Admin functions
exports.getRiders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }
    
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    const riders = await Rider.find(query)
      .populate('approvedBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Rider.countDocuments(query);

    res.status(200).json({
      success: true,
      count: riders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: riders,
    });
  } catch (error) {
    logger.error('Get riders error:', error);
    next(error);
  }
};

exports.getRider = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.params.id).populate('approvedBy', 'name email');

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error('Get rider error:', error);
    next(error);
  }
};

exports.approveRider = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    const action = req.originalUrl.includes('/approve') ? 'approve' : 'reject';

    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (action === 'approve') {
      rider.approvalStatus = 'approved';
      rider.approvedBy = req.admin._id;
      rider.approvedAt = new Date();
      rider.rejectionReason = undefined;
    } else {
      rider.approvalStatus = 'rejected';
      rider.rejectionReason = rejectionReason || 'Rider rejected by super admin';
      rider.approvedBy = undefined;
      rider.approvedAt = undefined;
    }

    await rider.save();

    const populatedRider = await Rider.findById(rider._id).populate('approvedBy', 'name email');

    logger.info(`Rider ${action}d: ${rider.fullName || rider.mobileNumber} by Admin: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: `Rider ${action}d successfully`,
      data: populatedRider,
    });
  } catch (error) {
    logger.error('Approve/reject rider error:', error);
    next(error);
  }
};

exports.suspendRider = async (req, res, next) => {
  try {
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    rider.isActive = !rider.isActive;
    await rider.save();

    const action = rider.isActive ? 'activated' : 'suspended';
    logger.info(`Rider ${action}: ${rider.mobileNumber} (ID: ${rider._id}) by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: `Rider ${action} successfully`,
      data: rider,
    });
  } catch (error) {
    logger.error('Suspend rider error:', error);
    next(error);
  }
};

