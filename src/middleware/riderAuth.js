const jwt = require('jsonwebtoken');
const Rider = require('../models/Rider');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization) {
    if (req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else {
      token = req.headers.authorization;
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route. Token is required.',
    });
  }

  token = token.trim();

  if (!token || token.length === 0) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token format. Token cannot be empty.',
    });
  }

  if (!token.includes('.')) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token format. Token must be a valid JWT.',
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'rider') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Rider privileges required.',
      });
    }

    req.rider = await Rider.findById(decoded.id);

    if (!req.rider) {
      return res.status(401).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!req.rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Please login again.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.',
      });
    }
    logger.error('Rider auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
    });
  }
};

module.exports = { protect };

