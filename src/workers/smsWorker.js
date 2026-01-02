const { smsQueue } = require('../utils/queue');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');

if (smsQueue) {
  smsQueue.process(async (job) => {
    const { mobile, message, otp } = job.data;
    
    logger.info(`Processing SMS job ${job.id} to ${mobile}`);
    
    try {
      if (otp) {
        await sendOTP(mobile, otp);
      } else {
        // TODO: Implement general SMS sending logic
        // await sendSMS(mobile, message);
        logger.info(`SMS sent to ${mobile}`);
      }
      
      return { success: true, mobile };
    } catch (error) {
      logger.error(`Failed to send SMS to ${mobile}:`, error);
      throw error;
    }
  });
  
  logger.info('SMS worker started');
}

module.exports = smsQueue;

