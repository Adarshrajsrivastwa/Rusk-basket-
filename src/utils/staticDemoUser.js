const STATIC_DEMO_CONTACT = '9565679102';
const STATIC_DEMO_OTP = '1234';

function isStaticDemoUserEnabled(contactNumber) {
  if (!contactNumber || contactNumber !== STATIC_DEMO_CONTACT) return false;
  if (process.env.ENABLE_STATIC_DEMO_LOGIN === 'false') return false;
  return (
    process.env.ENABLE_STATIC_DEMO_LOGIN === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
}

function assignOtpForLogin(user, contactNumber) {
  if (isStaticDemoUserEnabled(contactNumber)) {
    user.otp = {
      code: STATIC_DEMO_OTP,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    return STATIC_DEMO_OTP;
  }
  return user.generateOTP();
}

module.exports = {
  STATIC_DEMO_CONTACT,
  STATIC_DEMO_OTP,
  isStaticDemoUserEnabled,
  assignOtpForLogin,
};
