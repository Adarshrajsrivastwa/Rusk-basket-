const setTokenCookie = (res, token) => {
  const jwtExpire = process.env.JWT_EXPIRE || '7d';
  let cookieExpireMs = 7 * 24 * 60 * 60 * 1000;
  
  if (jwtExpire.endsWith('d')) {
    const days = parseInt(jwtExpire);
    cookieExpireMs = days * 24 * 60 * 60 * 1000;
  } else if (jwtExpire.endsWith('h')) {
    const hours = parseInt(jwtExpire);
    cookieExpireMs = hours * 60 * 60 * 1000;
  } else if (jwtExpire.endsWith('m')) {
    const minutes = parseInt(jwtExpire);
    cookieExpireMs = minutes * 60 * 1000;
  }

  const baseUrl = process.env.BASE_URL || 'http://46.202.164.93';
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookieOptions = {
    expires: new Date(Date.now() + cookieExpireMs),
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };

  if (isProduction && baseUrl) {
    try {
      const url = new URL(baseUrl);
      const hostname = url.hostname;
      if (hostname && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        cookieOptions.domain = hostname.startsWith('.') ? hostname : `.${hostname}`;
      }
    } catch (error) {
      const logger = require('./logger');
      logger.error('Invalid BASE_URL:', error);
    }
  }

  res.cookie('token', token, cookieOptions);
  return cookieOptions;
};

const clearTokenCookie = (res) => {
  const baseUrl = process.env.BASE_URL || 'http://46.202.164.93';
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    expires: new Date(0),
  };

  if (isProduction && baseUrl) {
    try {
      const url = new URL(baseUrl);
      const hostname = url.hostname;
      if (hostname && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        cookieOptions.domain = hostname.startsWith('.') ? hostname : `.${hostname}`;
      }
    } catch (error) {
      const logger = require('./logger');
      logger.error('Invalid BASE_URL:', error);
    }
  }

  res.cookie('token', '', cookieOptions);
};

module.exports = {
  setTokenCookie,
  clearTokenCookie,
};

