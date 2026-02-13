const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Rider = require('../models/Rider');
const Admin = require('../models/Admin');
const logger = require('../utils/logger');

/**
 * Universal authentication middleware
 * Tries to authenticate as User, Vendor, Rider, or Admin
 * Sets req.user, req.vendor, req.rider, or req.admin based on token
 */
const protectUniversal = async (req, res, next) => {
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

    if (!decoded.role) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Role information missing.',
      });
    }

    // Authenticate based on role
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
    } else if (decoded.role === 'vendor') {
      req.vendor = await Vendor.findById(decoded.id);
      if (!req.vendor) {
        return res.status(401).json({
          success: false,
          error: 'Vendor not found',
        });
      }
      if (!req.vendor.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Vendor account is deactivated',
        });
      }
    } else if (decoded.role === 'rider') {
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
    } else if (decoded.role === 'admin') {
      req.admin = await Admin.findById(decoded.id);
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          error: 'Admin not found',
        });
      }
      if (!req.admin.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Admin account is deactivated',
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: 'Invalid role in token',
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
    logger.error('Universal auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
    });
  }
};

module.exports = { protectUniversal };
