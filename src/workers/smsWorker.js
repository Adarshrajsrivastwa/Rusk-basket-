const { smsQueue } = require('../utils/queue');
const { sendOTP } = require('../utils/smsService');

if (smsQueue) {
  smsQueue.process(async (job) => {
    const { mobile, message, otp } = job.data;
    
    try {
      if (otp) {
        await sendOTP(mobile, otp);
      } else {
        // TODO: Implement general SMS sending logic
        // await sendSMS(mobile, message);
      }
      
      return { success: true, mobile };
    } catch (error) {
      throw error;
    }
  });
}

module.exports = smsQueue;

