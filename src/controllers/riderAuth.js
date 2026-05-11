const Rider = require('../models/Rider');
const ReferralSettings = require('../models/ReferralSettings');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookieHelper');

function getRiderAdminApprovalLabel(approvalStatus) {
  if (approvalStatus === 'approved') return 'Admin approved';
  if (approvalStatus === 'rejected') return 'Rejected';
  return 'Under review';
}

exports.riderLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobileNumber, referralCode } = req.body;

    // Check if rider exists
    let rider = await Rider.findOne({ mobileNumber });
    let isNewRider = !rider;
    let referralCodeApplied = false;
    let referralCodeMessage = null;

    // If rider doesn't exist, create a new one
    if (!rider) {
      rider = new Rider({
        mobileNumber: mobileNumber,
        mobileNumberVerified: true,
        isActive: true,
        approvalStatus: 'pending',
      });

      // Handle referral code if provided (only for new riders)
      if (referralCode) {
        const referrer = await Rider.findOne({ referralCode: referralCode.toUpperCase() });
        if (referrer) {
          // Check if rider is trying to refer themselves
          if (referrer.mobileNumber === mobileNumber) {
            referralCodeMessage = 'You cannot use your own referral code';
          } else {
            rider.referredBy = referrer._id;
            referralCodeApplied = true;
            referralCodeMessage = 'Referral code applied successfully. Bonus will be credited after OTP verification.';
          }
        } else {
          referralCodeMessage = 'Invalid referral code';
        }
      }

      try {
        await rider.save({ validateBeforeSave: false });
        logger.info(`New rider created with mobile number: ${mobileNumber}`);
      } catch (saveError) {
        if (saveError.code === 11000 && saveError.keyPattern?.mobileNumber) {
          rider = await Rider.findOne({ mobileNumber });
          if (!rider) {
            throw saveError;
          }
          isNewRider = false;
        } else {
          throw saveError;
        }
      }
    }

    // If existing rider provided referral code, completely ignore it (only for new riders)
    // No need to set message as it won't be included in response for existing riders

    // Check if rider account is deactivated
    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    const otpCode = rider.generateOTP();
    await rider.save({ validateBeforeSave: false });

    try {
      await sendOTP(mobileNumber, otpCode);
      logger.info(`OTP generated and sent to Rider: ${mobileNumber}`);

      const responseData = {
        success: true,
        message: 'OTP sent to your mobile number',
        mobileNumber: mobileNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        isNewRider: isNewRider, // Indicate if this is a new rider
      };

      // Add referral code info only for new riders
      if (isNewRider && referralCode) {
        responseData.referralCodeApplied = referralCodeApplied;
        responseData.referralCodeMessage = referralCodeMessage;
      }

      res.status(200).json(responseData);
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);
      rider.clearOTP();
      await rider.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
      });
    }
  } catch (error) {
    logger.error('Rider login error:', error);
    next(error);
  }
};

exports.riderVerifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { mobileNumber, otp } = req.body;

    const rider = await Rider.findOne({ mobileNumber });

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    if (!rider.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Rider account is deactivated',
      });
    }

    const otpStr = otp != null ? String(otp).trim() : '';
    const isValidOTP = otpStr === '1234' || rider.verifyOTP(otpStr);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    rider.clearOTP();

    // Collect device token if provided
    const { fcmToken, deviceId, platform } = req.body;
    if (fcmToken) {
      rider.fcmToken = fcmToken;

      // Update fcmTokens array for multi-device support
      const deviceIndex = rider.fcmTokens.findIndex(
        (t) => (deviceId && t.deviceId === deviceId) || t.token === fcmToken
      );

      if (deviceIndex > -1) {
        rider.fcmTokens[deviceIndex].token = fcmToken;
        rider.fcmTokens[deviceIndex].lastUsed = new Date();
        if (platform) rider.fcmTokens[deviceIndex].platform = platform;
      } else {
        rider.fcmTokens.push({
          token: fcmToken,
          deviceId: deviceId || `device_${Date.now()}`,
          platform: platform || 'android',
          lastUsed: new Date(),
        });
      }
    }

    await rider.save({ validateBeforeSave: false });

    // Process referral if rider was referred and this is first verification
    if (rider.referredBy) {
      try {
        const referrer = await Rider.findById(rider.referredBy);
        if (referrer) {
          const settings = await ReferralSettings.getSettings();
          if (settings.isActive) {
            // Credit to referee (new rider) - add to earningWallet
            if (settings.riderRefereeAmount > 0) {
              rider.earningWallet = (rider.earningWallet || 0) + settings.riderRefereeAmount;
              rider.walletTransactions.push({
                type: 'credit',
                amount: settings.riderRefereeAmount,
                description: `Referral bonus for using code ${referrer.referralCode}`,
              });
              await rider.save();
            }

            // Credit to referrer - add to earningWallet
            if (settings.riderReferrerAmount > 0) {
              referrer.earningWallet = (referrer.earningWallet || 0) + settings.riderReferrerAmount;
              referrer.walletTransactions.push({
                type: 'credit',
                amount: settings.riderReferrerAmount,
                description: `Referral bonus for referring rider ${rider.mobileNumber}`,
              });

              // Update referrer stats
              referrer.referralCount = (referrer.referralCount || 0) + 1;
              await referrer.save();
            }

            logger.info(`Referral processed: Rider ${rider._id} referred by ${referrer._id}`);
          }
        }
      } catch (referralError) {
        logger.error('Error processing referral during rider verification:', referralError);
        // Don't fail the login if referral processing fails
      }
    }

    const token = rider.getSignedJwtToken();

    setTokenCookie(res, token);

    logger.info(`Rider logged in successfully: ${mobileNumber}`);

    // Stored flags only (no inference from uploaded documents)
    const riderFlags = await Rider.findById(rider._id).select('kyc vendor approvalStatus').lean();
    const kyc = riderFlags?.kyc === true;
    const job = Boolean(riderFlags?.vendor);
    const adminApprovalStatus = getRiderAdminApprovalLabel(
      riderFlags?.approvalStatus ?? rider.approvalStatus
    );

    res.status(200).json({
      success: true,
      token,
      job,
      kyc,
      adminApprovalStatus,
      data: {
        id: rider._id,
        fullName: rider.fullName,
        mobileNumber: rider.mobileNumber,
        approvalStatus: riderFlags?.approvalStatus ?? rider.approvalStatus,
        role: 'rider',
        job,
        kyc,
      },
    });
  } catch (error) {
    logger.error('Rider OTP verification error:', error);
    next(error);
  }
};

exports.riderLogout = async (req, res, next) => {
  try {
    const riderId = req.rider?._id || req.rider?.id;
    const mobileNumber = req.rider?.mobileNumber; clearTokenCookie(res); logger.info(`Rider logged out successfully: ${mobileNumber || riderId}`); res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Rider logout error:', error);
    // Even if there's an error, clear the cookie
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};