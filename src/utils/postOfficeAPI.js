const axios = require('axios');
const https = require('https');
const logger = require('./logger');

/** Third-party api.postalpincode.in often serves an expired TLS cert; use only on cert failure. */
const postalPincodeHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const isCertificateError = (error) => {
  const message = (error.message || '').toLowerCase();
  const code = error.code || '';
  return (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    message.includes('certificate') ||
    message.includes('cert')
  );
};

const parsePostalPincodeResponse = (data, cleanPinCode) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return {
      success: false,
      error: `Invalid PIN code: ${cleanPinCode}. Unable to validate`,
    };
  }

  const record = data[0];

  if (record.Status === 'Success' && record.PostOffice && record.PostOffice.length > 0) {
    const firstOffice = record.PostOffice[0];
    const city = firstOffice.District || firstOffice.Name || '';
    const state = firstOffice.State || '';

    if (city && state) {
      return {
        city,
        state,
        success: true,
      };
    }
  }

  if (
    record.Status === 'Error' ||
    (record.Status === 'Success' && (!record.PostOffice || record.PostOffice.length === 0))
  ) {
    return {
      success: false,
      error: `Invalid PIN code: ${cleanPinCode}. No post office found for this PIN code`,
    };
  }

  return {
    success: false,
    error: `Invalid PIN code: ${cleanPinCode}. Unable to validate`,
  };
};

const fetchPostalPincode = async (cleanPinCode, { useInsecureTls = false } = {}) => {
  const config = {
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RuskBasket/1.0',
    },
  };

  if (useInsecureTls) {
    config.httpsAgent = postalPincodeHttpsAgent;
  }

  const response = await axios.get(
    `https://api.postalpincode.in/pincode/${cleanPinCode}`,
    config
  );

  return parsePostalPincodeResponse(response.data, cleanPinCode);
};

const getPostOfficeDetails = async (pinCode, retries = 3) => {
  if (!pinCode || typeof pinCode !== 'string' || !/^\d{6}$/.test(pinCode.trim())) {
    return {
      success: false,
      error: 'Invalid PIN code format. Must be a 6-digit number',
    };
  }

  const cleanPinCode = pinCode.trim();
  let lastError = null;
  let triedInsecureTls = false;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(
        `Fetching post office details for PIN: ${cleanPinCode} (Attempt ${attempt}/${retries}${triedInsecureTls ? ', TLS fallback' : ''})`
      );

      const result = await fetchPostalPincode(cleanPinCode, {
        useInsecureTls: triedInsecureTls,
      });

      if (result.success) {
        logger.info(
          `Successfully fetched post office details for PIN ${cleanPinCode}: ${result.city}, ${result.state}`
        );
      }

      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || 'Unknown error';

      if (!triedInsecureTls && isCertificateError(error)) {
        triedInsecureTls = true;
        logger.warn(
          `Post Office API TLS certificate error for PIN ${cleanPinCode}; retrying with certificate verification disabled`
        );
        try {
          const result = await fetchPostalPincode(cleanPinCode, { useInsecureTls: true });
          if (result.success) {
            logger.info(
              `Fetched post office details for PIN ${cleanPinCode} via TLS fallback: ${result.city}, ${result.state}`
            );
          }
          return result;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }

      const isNetworkError =
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ECONNRESET' ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('network');

      logger.error(`Post Office API error (Attempt ${attempt}/${retries}) for PIN ${cleanPinCode}:`, {
        message: errorMessage,
        code: error.code,
        isNetworkError,
      });

      if (attempt === retries) {
        if (isNetworkError) {
          return {
            success: false,
            error: `Network error: Unable to connect to Post Office API. Please check your internet connection and try again. (PIN: ${cleanPinCode})`,
          };
        }
        return {
          success: false,
          error: `Failed to fetch post office details for PIN ${cleanPinCode}. ${lastError?.message || errorMessage}`,
        };
      }

      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return {
    success: false,
    error: `Failed to fetch post office details for PIN ${cleanPinCode} after ${retries} attempts. ${lastError ? lastError.message : 'Unknown error'}`,
  };
};

module.exports = { getPostOfficeDetails };
