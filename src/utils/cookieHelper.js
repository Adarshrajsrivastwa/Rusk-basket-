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
  
  // Determine if we're in production (using HTTPS domains)
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.BACKEND_URL?.includes('api.rushbaskets.com') ||
                       process.env.FRONTEND_URL?.includes('grocery.rushbaskets.com');
  
  const cookieOptions = {
    maxAge: cookieExpireMs,
    httpOnly: false,
    secure: isProduction ? true : false, // Use secure cookies in production (HTTPS only)
    sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-subdomain (api.rushbaskets.com to grocery.rushbaskets.com)
    path: '/',
    domain: isProduction ? '.rushbaskets.com' : undefined, // Set domain for cross-subdomain cookies in production
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
  // Determine if we're in production (using HTTPS domains)
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.BACKEND_URL?.includes('api.rushbaskets.com') ||
                       process.env.FRONTEND_URL?.includes('grocery.rushbaskets.com');
  
  const cookieOptions = {
    httpOnly: false,
    secure: isProduction ? true : false,
    sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-subdomain
    path: '/',
    domain: isProduction ? '.rushbaskets.com' : undefined,
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

