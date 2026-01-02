const axios = require('axios');
const logger = require('./logger');

const getPostOfficeDetails = async (pinCode) => {
  try {
    const response = await axios.get(`https://api.postalpincode.in/pincode/${pinCode}`, {
      timeout: 5000,
    });

    if (response.data && response.data[0] && response.data[0].Status === 'Success') {
      const postOffice = response.data[0].PostOffice;
      if (postOffice && postOffice.length > 0) {
        const firstOffice = postOffice[0];
        return {
          city: firstOffice.District || firstOffice.Name,
          state: firstOffice.State,
          success: true,
        };
      }
    }

    return {
      success: false,
      error: 'Invalid PIN code or no data found',
    };
  } catch (error) {
    logger.error('Post Office API error:', error.message);
    return {
      success: false,
      error: 'Failed to fetch post office details',
    };
  }
};

module.exports = { getPostOfficeDetails };

