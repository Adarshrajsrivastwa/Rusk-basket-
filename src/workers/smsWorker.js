const logger = require('../utils/logger');
const { sendOTP } = require('../utils/smsService');

/**
 * Initialize the SMS worker
 */
const initializeSMSWorker = () => {
  const { smsQueue } = require('../utils/queue');

  if (smsQueue) {
    smsQueue.process(async (job) => {
      const { mobile, message, otp } = job.data;

      try {
        if (otp) {
          await sendOTP(mobile, otp);
        } else {
          // TODO: Implement general SMS sending logic
        }

        return { success: true, mobile };
      } catch (error) {
        logger.error('SMS worker error:', error);
        throw error;
      }
    });
    logger.info('SMS worker started processing');
  }
};

module.exports = { initializeSMSWorker };

