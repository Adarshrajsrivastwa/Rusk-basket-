const User = require('../models/User');
const ReferralSettings = require('../models/ReferralSettings');
const { sendOTP } = require('../utils/smsService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { setTokenCookie, clearTokenCookie } = require('../utils/cookieHelper');

exports.userLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber, referralCode } = req.body;

    // Check if user exists
    let user = await User.findOne({ contactNumber });
    let isNewUser = !user;
    let referralCodeApplied = false;
    let referralCodeMessage = null;

    // If user doesn't exist, create a new one
    if (!user) {
      user = new User({
        contactNumber: contactNumber,
        contactNumberVerified: false,
        isActive: true,
        // Email is optional - don't set it at all
      });

      // Ensure email is not included in the document
      user.email = undefined;

      // Handle referral code if provided (only for new users)
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        if (referrer) {
          // Check if user is trying to refer themselves
          if (referrer.contactNumber === contactNumber) {
            referralCodeMessage = 'You cannot use your own referral code';
          } else {
            user.referredBy = referrer._id;
            referralCodeApplied = true;
            referralCodeMessage = 'Referral code applied successfully. Bonus will be credited after OTP verification.';
          }
        } else {
          referralCodeMessage = 'Invalid referral code';
        }
      }

      try {
        await user.save({ validateBeforeSave: false });
        logger.info(`New user created with contact number: ${contactNumber}`);
      } catch (saveError) {
        // Handle duplicate key error for email/phone (E11000) - auto-fix
        if (saveError.code === 11000 && (saveError.keyPattern?.email || saveError.keyPattern?.phone || saveError.message?.includes('email') || saveError.message?.includes('phone'))) {
          logger.warn(`Index issue detected (email/phone), attempting to fix: ${contactNumber}`);

          try {
            // Try to fix the index issue
            const mongoose = require('mongoose');
            const db = mongoose.connection.db;
            if (db) {
              // Drop email index
              try {
                await db.collection('users').dropIndex('email_1');
                logger.info('Dropped problematic email index');
              } catch (dropError) {
                if (dropError.code !== 27) {
                  logger.error('Error dropping email index:', dropError);
                }
              }

              // Drop phone index
              try {
                await db.collection('users').dropIndex('phone_1');
                logger.info('Dropped problematic phone index');
              } catch (dropError) {
                if (dropError.code !== 27) {
                  logger.error('Error dropping phone index:', dropError);
                }
              }
            }

            // Retry user creation
            user = new User({
              contactNumber: contactNumber,
              contactNumberVerified: false,
              isActive: true,
            });
            user.email = undefined;
            await user.save({ validateBeforeSave: false });
            logger.info(`New user created with contact number (after fix): ${contactNumber}`);
          } catch (retryError) {
            logger.error('Error retrying user creation:', retryError);
            throw saveError; // Throw original error
          }
        } else {
          throw saveError;
        }
      }
    }

    // If existing user provided referral code, completely ignore it (only for new users)
    // No need to set message as it won't be included in response for existing users

    // Check if user account is deactivated
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
      });
    }

    const otpCode = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    try {
      await sendOTP(contactNumber, otpCode);
      logger.info(`OTP generated and sent to User: ${contactNumber}`);

      const responseData = {
        success: true,
        message: 'OTP sent to your contact number',
        contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
        isNewUser: isNewUser,
      };

      if (isNewUser && referralCode) {
        responseData.referralCodeApplied = referralCodeApplied;
        responseData.referralCodeMessage = referralCodeMessage;
      }

      res.status(200).json(responseData);
    } catch (smsError) {
      logger.error('Failed to send OTP:', smsError);

      return res.status(503).json({
        success: false,
        error: 'Failed to send OTP. Please try again shortly.',
      });
    }
  } catch (error) {
    logger.error('User login error:', error);

    // Handle duplicate key error (contact number already exists)
    if (error.code === 11000 && error.keyPattern?.contactNumber) {
      // Retry by finding the existing user
      try {
        const { contactNumber } = req.body;
        const user = await User.findOne({ contactNumber });

        if (user && user.isActive) {
          const otpCode = user.generateOTP();
          await user.save({ validateBeforeSave: false });

          try {
            await sendOTP(contactNumber, otpCode);
            return res.status(200).json({
              success: true,
              message: 'OTP sent to your contact number',
              contactNumber: contactNumber.replace(/(\d{2})(\d{4})(\d{4})/, '$1****$3'),
              isNewUser: false,
            });
          } catch (smsError) {
            logger.error('Failed to send OTP on retry:', smsError);
            return res.status(503).json({
              success: false,
              error: 'Failed to send OTP. Please try again shortly.',
            });
          }
        }
      } catch (retryError) {
        logger.error('Retry error:', retryError);
      }
    }

    next(error);
  }
};

exports.userVerifyOTP = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { contactNumber, otp } = req.body;

    const user = await User.findOne({ contactNumber });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
      });
    }

    const isValidOTP = user.verifyOTP(otp != null ? String(otp) : otp);

    if (!isValidOTP) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired OTP',
      });
    }

    // Mark contact number as verified after successful OTP verification
    const wasVerified = user.contactNumberVerified;
    user.contactNumberVerified = true;
    user.clearOTP();

    // Collect device token if provided
    const { fcmToken, deviceId, platform } = req.body;
    if (fcmToken) {
      user.fcmToken = fcmToken;

      // Update fcmTokens array for multi-device support
      const deviceIndex = user.fcmTokens.findIndex(
        (t) => (deviceId && t.deviceId === deviceId) || t.token === fcmToken
      );

      if (deviceIndex > -1) {
        user.fcmTokens[deviceIndex].token = fcmToken;
        user.fcmTokens[deviceIndex].lastUsed = new Date();
        if (platform) user.fcmTokens[deviceIndex].platform = platform;
      } else {
        user.fcmTokens.push({
          token: fcmToken,
          deviceId: deviceId || `device_${Date.now()}`,
          platform: platform || 'android',
          lastUsed: new Date(),
        });
      }
    }

    await user.save({ validateBeforeSave: false });

    // Process referral if user was referred and this is first verification
    if (user.referredBy && !wasVerified) {
      try {
        const referrer = await User.findById(user.referredBy);
        if (referrer) {
          const settings = await ReferralSettings.getSettings();
          if (settings.isActive) {
            // Credit to referee (new user) - add to cashback
            if (settings.userRefereeAmount > 0) {
              user.cashback = (user.cashback || 0) + settings.userRefereeAmount;
              await user.save();
            }

            // Credit to referrer - add to cashback
            if (settings.userReferrerAmount > 0) {
              referrer.cashback = (referrer.cashback || 0) + settings.userReferrerAmount;

              // Update referrer stats
              referrer.referralCount = (referrer.referralCount || 0) + 1;
              await referrer.save();
            }

            logger.info(`Referral processed: User ${user._id} referred by ${referrer._id}`);
          }
        }
      } catch (referralError) {
        logger.error('Error processing referral during user verification:', referralError);
        // Don't fail the login if referral processing fails
      }
    }

    const token = user.getSignedJwtToken();

    logger.info(`User logged in successfully: ${contactNumber}`);
    logger.info(`Setting token cookie for user: ${contactNumber}`);

    try {
      setTokenCookie(res, token, req);
    } catch (cookieError) {
      logger.error('Cookie setting error (ignoring):', cookieError);
    }

    const responseData = {
      success: true,
      token,
      data: {
        id: user._id,
        userName: user.userName,
        contactNumber: user.contactNumber,
        email: user.email,
        contactNumberVerified: user.contactNumberVerified,
        role: 'user',
      },
    };

    logger.info(`Response headers before send:`, res.getHeaders());

    res.status(200).json(responseData);
  } catch (error) {
    logger.error('User OTP verification error:', error);
    next(error);
  }
};

exports.userLogout = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const contactNumber = req.user?.contactNumber;

    clearTokenCookie(res);

    logger.info(`User logged out successfully: ${contactNumber || userId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('User logout error:', error);
    // Even if there's an error, clear the cookie
    clearTokenCookie(res);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};
