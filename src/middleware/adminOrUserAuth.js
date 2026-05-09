const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Requires a valid JWT whose role is `admin` or `user`.
 * Sets `req.admin` or `req.user` accordingly.
 */
const protectAdminOrUser = async (req, res, next) => {
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

    if (decoded.role === 'admin') {
      req.admin = await Admin.findById(decoded.id);

      if (!req.admin) {
        return res.status(401).json({
          success: false,
          error: 'Admin not found',
          message: 'The admin account associated with this token does not exist.',
        });
      }

      if (!req.admin.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Admin account is deactivated',
          message: 'Your admin account has been deactivated. Please contact the system administrator.',
        });
      }

      return next();
    }

    if (decoded.role === 'user') {
      req.user = await User.findById(decoded.id);

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
        });
      }

      if (!req.user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'User account is deactivated',
        });
      }

      return next();
    }

    logger.warn(`Coupon route access denied for role: ${decoded.role}, id: ${decoded.id}`);
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin or user token required.',
      message: `Current role: ${decoded.role || 'unknown'}.`,
    });
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
    logger.error('AdminOrUser auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
    });
  }
};

module.exports = { protectAdminOrUser };
