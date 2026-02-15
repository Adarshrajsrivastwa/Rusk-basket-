const User = require('../models/User');
const Rider = require('../models/Rider');
const ReferralSettings = require('../models/ReferralSettings');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Get user referral code and stats
 */
exports.getUserReferral = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('referralCode referralCount');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Generate referral code if doesn't exist
    if (!user.referralCode) {
      let isUnique = false;
      let referralCode;
      while (!isUnique) {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        referralCode = `USER${randomStr}`;
        const existing = await User.findOne({ referralCode });
        if (!existing) {
          isUnique = true;
          user.referralCode = referralCode;
          await user.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralCount: user.referralCount || 0,
      },
    });
  } catch (error) {
    logger.error('Get user referral error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get referral information',
    });
  }
};

/**
 * Apply referral code for user (during registration)
 */
exports.applyUserReferralCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const { referralCode } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if user already has a referrer
    if (user.referredBy) {
      return res.status(400).json({
        success: false,
        error: 'Referral code has already been applied',
      });
    }

    // Allow to apply if referral code is not applied yet (referredBy is null)
    // No time restriction - user can apply referral code anytime if not applied

    // Find referrer by code
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code',
      });
    }

    // Can't refer yourself
    if (referrer._id.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        error: 'You cannot use your own referral code',
      });
    }

    // Get referral settings
    const settings = await ReferralSettings.getSettings();
    if (!settings.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Referral system is currently inactive',
      });
    }

    // Update user with referrer
    user.referredBy = referrer._id;
    await user.save();

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

    logger.info(`Referral code applied: User ${userId} referred by ${referrer._id}`);

    res.status(200).json({
      success: true,
      message: 'Referral code applied successfully',
      data: {
        referrerAmount: settings.userReferrerAmount,
        refereeAmount: settings.userRefereeAmount,
      },
    });
  } catch (error) {
    logger.error('Apply user referral code error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply referral code',
    });
  }
};

/**
 * Get rider referral code and stats
 */
exports.getRiderReferral = async (req, res, next) => {
  try {
    const riderId = req.rider._id;

    const rider = await Rider.findById(riderId).select('referralCode referralCount');

    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Generate referral code if doesn't exist
    if (!rider.referralCode) {
      let isUnique = false;
      let referralCode;
      while (!isUnique) {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        referralCode = `RIDER${randomStr}`;
        const existing = await Rider.findOne({ referralCode });
        if (!existing) {
          isUnique = true;
          rider.referralCode = referralCode;
          await rider.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        referralCode: rider.referralCode,
        referralCount: rider.referralCount || 0,
      },
    });
  } catch (error) {
    logger.error('Get rider referral error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get referral information',
    });
  }
};

/**
 * Apply referral code for rider (during registration)
 */
exports.applyRiderReferralCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const riderId = req.rider._id;
    const { referralCode } = req.body;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        error: 'Rider not found',
      });
    }

    // Check if rider already has a referrer
    if (rider.referredBy) {
      return res.status(400).json({
        success: false,
        error: 'Referral code has already been applied',
      });
    }

    // Allow to apply if referral code is not applied yet (referredBy is null)
    // No time restriction - rider can apply referral code anytime if not applied

    // Find referrer by code
    const referrer = await Rider.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code',
      });
    }

    // Can't refer yourself
    if (referrer._id.toString() === riderId.toString()) {
      return res.status(400).json({
        success: false,
        error: 'You cannot use your own referral code',
      });
    }

    // Get referral settings
    const settings = await ReferralSettings.getSettings();
    if (!settings.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Referral system is currently inactive',
      });
    }

    // Update rider with referrer
    rider.referredBy = referrer._id;
    await rider.save();

    // Credit to referee (new rider) - add to earningWallet
    if (settings.riderRefereeAmount > 0) {
      rider.earningWallet = (rider.earningWallet || 0) + settings.riderRefereeAmount;
      rider.walletTransactions.push({
        type: 'credit',
        amount: settings.riderRefereeAmount,
        description: `Referral bonus for using code ${referralCode}`,
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

    logger.info(`Referral code applied: Rider ${riderId} referred by ${referrer._id}`);

    res.status(200).json({
      success: true,
      message: 'Referral code applied successfully',
      data: {
        referrerAmount: settings.riderReferrerAmount,
        refereeAmount: settings.riderRefereeAmount,
      },
    });
  } catch (error) {
    logger.error('Apply rider referral code error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply referral code',
    });
  }
};
