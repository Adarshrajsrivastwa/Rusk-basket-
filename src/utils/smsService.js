const axios = require('axios');
const logger = require('./logger');
const { addSMSJob } = require('./queue');

const sendOTP = async (mobile, otp, useQueue = false) => {
  try {
    const nimbusUserId = process.env.NIMBUS_USER_ID?.trim();
    const nimbusPassword = process.env.NIMBUS_PASSWORD?.trim();
    const nimbusSenderId = (process.env.NIMBUS_SENDER_ID || 'RUSHBKT')?.trim();
    const nimbusEntityId = process.env.NIMBUS_ENTITY_ID?.trim();
    const nimbusTemplateId = process.env.NIMBUS_TEMPLATE_ID?.trim();
    const nimbusApiUrl = (process.env.NIMBUS_API_URL || 'http://nimbusit.biz/api/SmsApi/SendSingleApi')?.trim();

    if (!nimbusUserId || !nimbusPassword) {
      logger.error('Nimbus credentials not configured');
      throw new Error('SMS service not configured');
    }

    const hasTemplateId = nimbusTemplateId && !nimbusTemplateId.startsWith('#');
    
    if (!otp || otp.toString().trim() === '') {
      throw new Error('OTP is required and cannot be empty');
    }
    
    const otpString = otp.toString().trim();
    const messageTemplate = process.env.NIMBUS_MESSAGE_TEMPLATE || 'Your RUSH BASKETS GROSER Login OTP is {#var#}. This is valid for 5 minutes.';
    const message = messageTemplate.replace(/{#var#}/g, otpString);
    
    if (message.includes('{#var#}')) {
      logger.error('OTP replacement failed');
      throw new Error('Failed to replace OTP in message template');
    }

    if (useQueue && (process.env.REDIS_URL || process.env.REDIS_HOST)) {
      const job = await addSMSJob({ mobile, otp, message });
      return { success: true, queued: true, jobId: job?.id };
    }

    let cleanMobile = mobile.replace(/\D/g, '');
    
    if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      cleanMobile = cleanMobile.substring(2);
    }
    
    if (cleanMobile.length < 10) {
      throw new Error('Invalid mobile number format');
    }
    
    const params = new URLSearchParams({
      UserID: nimbusUserId,
      Password: nimbusPassword,
      SenderID: nimbusSenderId,
      Phno: cleanMobile,
      Msg: message,
    });

    if (nimbusEntityId && !nimbusEntityId.startsWith('#')) {
      params.append('EntityID', nimbusEntityId);
    }

    if (hasTemplateId) {
      params.append('TemplateID', nimbusTemplateId);
    }

    const apiUrl = `${nimbusApiUrl}?${params.toString()}`;
    const response = await axios.get(apiUrl, { timeout: 30000 });

    const responseData = response.data;
    const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);

    if (responseStr) {
      const responseLower = responseStr.toLowerCase();
      
      if (responseLower.includes('success') || 
          responseLower.includes('sent') || 
          responseLower.includes('submitted') ||
          responseLower.includes('message id') ||
          responseLower.includes('msgid')) {
        return { success: true, response: responseStr };
      } 
      
      if (responseLower.includes('error') || 
          responseLower.includes('fail') || 
          responseLower.includes('invalid') ||
          responseLower.includes('unauthorized') ||
          responseLower.includes('denied') ||
          responseLower.includes('rejected')) {
        logger.error('Nimbus API error:', responseStr);
        throw new Error(`SMS sending failed: ${responseStr}`);
      }
      
      if (responseLower.includes('pending') || responseLower.includes('queued')) {
        return { success: true, queued: true, response: responseStr };
      }
    }

    return { success: true, response: responseStr };
  } catch (error) {
    logger.error('Error sending OTP via Nimbus:', error.message);
    if (error.response) {
      logger.error('Nimbus API error response:', error.response.data);
    }
    throw error;
  }
};

module.exports = { sendOTP };

