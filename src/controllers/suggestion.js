const Suggestion = require('../models/Suggestion');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

exports.createSuggestion = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { text } = req.body;

    // Allow both public (no admin) and admin-created suggestions
    const suggestionData = {
      text,
    };

    // If admin is logged in, set createdBy
    if (req.admin && req.admin._id) {
      suggestionData.createdBy = req.admin._id;
    }

    const suggestion = await Suggestion.create(suggestionData);

    const populatedSuggestion = await Suggestion.findById(suggestion._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    const creatorInfo = req.admin 
      ? `Admin: ${req.admin.email || req.admin._id}` 
      : 'Public User';
    
    logger.info(`Suggestion created: ${suggestion._id} by ${creatorInfo}`);

    res.status(201).json({
      success: true,
      message: 'Suggestion created successfully',
      data: populatedSuggestion,
    });
  } catch (error) {
    logger.error('Create suggestion error:', error);
    next(error);
  }
};

exports.getSuggestions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const suggestions = await Suggestion.find()
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Suggestion.countDocuments();

    res.status(200).json({
      success: true,
      count: suggestions.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: suggestions,
    });
  } catch (error) {
    logger.error('Get suggestions error:', error);
    next(error);
  }
};

exports.getSuggestion = async (req, res, next) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        error: 'Suggestion not found',
      });
    }

    res.status(200).json({
      success: true,
      data: suggestion,
    });
  } catch (error) {
    logger.error('Get suggestion error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid suggestion ID',
      });
    }
    next(error);
  }
};

exports.updateSuggestion = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const suggestion = await Suggestion.findById(req.params.id);

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        error: 'Suggestion not found',
      });
    }

    const { text } = req.body;

    if (text !== undefined) suggestion.text = text;
    suggestion.updatedBy = req.admin._id;

    await suggestion.save();

    const populatedSuggestion = await Suggestion.findById(suggestion._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    logger.info(`Suggestion updated: ${suggestion._id} by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Suggestion updated successfully',
      data: populatedSuggestion,
    });
  } catch (error) {
    logger.error('Update suggestion error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid suggestion ID',
      });
    }
    next(error);
  }
};

exports.deleteSuggestion = async (req, res, next) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        error: 'Suggestion not found',
      });
    }

    await Suggestion.findByIdAndDelete(req.params.id);

    logger.info(`Suggestion deleted: ${suggestion._id} by Admin: ${req.admin.email || req.admin._id}`);

    res.status(200).json({
      success: true,
      message: 'Suggestion deleted successfully',
    });
  } catch (error) {
    logger.error('Delete suggestion error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid suggestion ID',
      });
    }
    next(error);
  }
};
