const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Attaches req.user when a valid user JWT is present; otherwise leaves req.user unset.
 * Does not send 401 — for routes that work anonymously but can widen catalog for static demo user.
 */
const optionalUser = async (req, res, next) => {
  req.user = undefined;
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

  if (!token || typeof token !== 'string') {
    return next();
  }

  token = token.trim();
  if (!token.includes('.')) {
    return next();
  }

  try {
    if (!process.env.JWT_SECRET) {
      return next();
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'user') {
      return next();
    }
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return next();
    }
    req.user = user;
  } catch (error) {
    if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
      logger.error('optionalUser middleware error:', error);
    }
  }
  next();
};

module.exports = { optionalUser };
