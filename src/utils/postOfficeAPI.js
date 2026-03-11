const axios = require('axios');
const logger = require('./logger');

const getPostOfficeDetails = async (pinCode, retries = 3) => {
  // Validate PIN code format first
  if (!pinCode || typeof pinCode !== 'string' || !/^\d{6}$/.test(pinCode.trim())) {
    return {
      success: false,
      error: 'Invalid PIN code format. Must be a 6-digit number',
    };
  }

  const cleanPinCode = pinCode.trim();
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Fetching post office details for PIN: ${cleanPinCode} (Attempt ${attempt}/${retries})`);
      
      const response = await axios.get(`https://api.postalpincode.in/pincode/${cleanPinCode}`, {
        timeout: 10000, // Increased timeout to 10 seconds
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const data = response.data[0];
        
        if (data.Status === 'Success' && data.PostOffice && data.PostOffice.length > 0) {
          const firstOffice = data.PostOffice[0];
          const city = firstOffice.District || firstOffice.Name || '';
          const state = firstOffice.State || '';

          if (city && state) {
            logger.info(`Successfully fetched post office details for PIN ${cleanPinCode}: ${city}, ${state}`);
            return {
              city: city,
              state: state,
              success: true,
            };
          }
        }

        // If Status is not Success or no PostOffice data
        if (data.Status === 'Error' || (data.Status === 'Success' && (!data.PostOffice || data.PostOffice.length === 0))) {
          return {
            success: false,
            error: `Invalid PIN code: ${cleanPinCode}. No post office found for this PIN code`,
          };
        }
      }

      // If response structure is unexpected
      logger.warn(`Unexpected response structure for PIN ${cleanPinCode}:`, response.data);
      return {
        success: false,
        error: `Invalid PIN code: ${cleanPinCode}. Unable to validate`,
      };

    } catch (error) {
      lastError = error;
      const errorMessage = error.message || 'Unknown error';
      // Include ECONNRESET, ECONNRESET, and other connection errors
      const isNetworkError = error.code === 'ECONNABORTED' || 
                            error.code === 'ETIMEDOUT' || 
                            error.code === 'ENOTFOUND' || 
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ECONNRESET' ||
                            error.message.includes('ECONNRESET') ||
                            error.message.includes('timeout') ||
                            error.message.includes('network');

      logger.error(`Post Office API error (Attempt ${attempt}/${retries}) for PIN ${cleanPinCode}:`, {
        message: errorMessage,
        code: error.code,
        isNetworkError: isNetworkError,
        stack: error.stack,
      });

      // If it's the last attempt, return error
      if (attempt === retries) {
        if (isNetworkError) {
          return {
            success: false,
            error: `Network error: Unable to connect to Post Office API. Please check your internet connection and try again. (PIN: ${cleanPinCode})`,
          };
        }
        return {
          success: false,
          error: `Failed to fetch post office details for PIN ${cleanPinCode}. ${errorMessage}`,
        };
      }

      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.info(`Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Fallback error
  return {
    success: false,
    error: `Failed to fetch post office details for PIN ${cleanPinCode} after ${retries} attempts. ${lastError ? lastError.message : 'Unknown error'}`,
  };
};

module.exports = { getPostOfficeDetails };

