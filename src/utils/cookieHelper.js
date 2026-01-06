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
  
  const cookieOptions = {
    maxAge: cookieExpireMs,
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    path: '/',
  };

  try {
    res.cookie('token', token, cookieOptions);
    
    const logger = require('./logger');
    logger.info(`Token cookie set: httpOnly=${cookieOptions.httpOnly}, secure=${cookieOptions.secure}, sameSite=${cookieOptions.sameSite}, path=${cookieOptions.path}, maxAge=${cookieExpireMs}ms`);
    logger.info(`Cookie value length: ${token.length} characters`);
    
    const setCookieHeader = res.getHeader('Set-Cookie');
    logger.info(`Set-Cookie header: ${setCookieHeader}`);
    
    return cookieOptions;
  } catch (error) {
    const logger = require('./logger');
    logger.error('Error setting cookie:', error);
    throw error;
  }
};

const clearTokenCookie = (res) => {
  const cookieOptions = {
    httpOnly: false,
    secure: false,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  };

  res.cookie('token', '', cookieOptions);
  
  const logger = require('./logger');
  logger.info('Token cookie cleared');
};

module.exports = {
  setTokenCookie,
  clearTokenCookie,
};

