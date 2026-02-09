const jwt = require('jsonwebtoken');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization) {
    if (req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else {
      token = req.headers.authorization;
    }
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
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

    // Log decoded token for debugging (without sensitive data)
    logger.debug(`Vendor auth - Decoded token: role=${decoded.role}, id=${decoded.id}, path=${req.path}`);

    if (!decoded.role) {
      logger.warn(`Vendor access denied - Token missing role field, user ID: ${decoded.id}, path: ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied. Vendor privileges required.',
        message: 'Token is missing role information. Please login again.',
        debug: process.env.NODE_ENV === 'development' ? { decoded: { id: decoded.id } } : undefined,
      });
    }

    if (decoded.role !== 'vendor') {
      logger.warn(`Vendor access denied for role: ${decoded.role}, user ID: ${decoded.id}, path: ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied. Vendor privileges required.',
        message: `Current role: ${decoded.role || 'unknown'}. Vendor role required.`,
        debug: process.env.NODE_ENV === 'development' ? { decoded: { id: decoded.id, role: decoded.role } } : undefined,
      });
    }

    req.vendor = await Vendor.findById(decoded.id);

    if (!req.vendor) {
      logger.warn(`Vendor not found for ID: ${decoded.id}, path: ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Vendor not found',
        message: 'The vendor account associated with this token does not exist.',
      });
    }

    if (!req.vendor.isActive) {
      logger.warn(`Inactive vendor account access attempt: ${decoded.id}, path: ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Vendor account is deactivated',
        message: 'Your vendor account has been deactivated. Please contact the system administrator.',
      });
    }

    logger.debug(`Vendor authenticated: ${req.vendor._id}, path: ${req.path}`);

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn(`Invalid JWT token for vendor auth, path: ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Please login again.',
        message: 'The authentication token is invalid or malformed.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn(`Expired token for vendor auth, path: ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.',
        message: 'Your session has expired. Please login again.',
      });
    }
    logger.error(`Vendor auth middleware error for path ${req.path}:`, error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
      message: error.message || 'An error occurred during authentication.',
    });
  }
};

module.exports = { protect };

