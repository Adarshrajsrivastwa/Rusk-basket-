const Coupon = require('../models/Coupon');
const User = require('../models/User');
const logger = require('../utils/logger');
// const { sendNotification } = require('../utils/notificationService'); // Uncomment when notification service is available

// Function to send daily notifications for today's offers
exports.sendTodayOfferNotifications = async () => {
  try {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Find all active today's offers
    const todayOffers = await Coupon.find({
      offerType: 'today_offer',
      status: 'active',
      isActive: true,
      sendNotification: true,
      'dateRange.startDate': { $lte: currentDate },
      'dateRange.endDate': { $gte: currentDate },
    })
      .populate('products', 'productName thumbnail')
      .populate('categories', 'name');

    if (todayOffers.length === 0) {
      logger.info('No active today offers found for notification');
      return;
    }

    // Get all active users
    const users = await User.find({ isActive: true }).select('_id contactNumber');

    let notificationCount = 0;

    for (const offer of todayOffers) {
      // Check if notification was already sent today
      if (offer.notificationSent) {
        continue;
      }

      // Check if current time is within the offer time range
      if (offer.timeRange && offer.timeRange.startTime && offer.timeRange.endTime) {
        if (currentTime < offer.timeRange.startTime || currentTime > offer.timeRange.endTime) {
          continue;
        }
      }

      // Calculate countdown timer
      const endTime = offer.timeRange?.endTime || '23:59:59';
      const [endHour, endMinute] = endTime.split(':').map(Number);
      const endDateTime = new Date(now);
      endDateTime.setHours(endHour, endMinute, 0, 0);
      
      // If end time has passed today, set for tomorrow
      if (endDateTime < now) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      const countdownMs = endDateTime - now;
      const hours = Math.floor(countdownMs / (1000 * 60 * 60));
      const minutes = Math.floor((countdownMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((countdownMs % (1000 * 60)) / 1000);

      // Send notification to all users
      for (const user of users) {
        try {
          const message = `🔥 Today's Special Offer! ${offer.couponName}\n` +
            `Get ₹${offer.offerAmount} off on selected products!\n` +
            `Time remaining: ${hours}h ${minutes}m ${seconds}s\n` +
            `Use code: ${offer.code}`;

          // Send notification (implement based on your notification service)
          // TODO: Implement notification sending
          // await sendNotification(user._id, {
          //   title: 'Today\'s Special Offer',
          //   message: message,
          //   type: 'today_offer',
          //   couponId: offer._id,
          //   countdown: {
          //     hours,
          //     minutes,
          //     seconds,
          //     endTime: endDateTime.toISOString(),
          //   },
          // });
          
          logger.info(`Notification prepared for user ${user.contactNumber}: ${message}`);

          notificationCount++;
        } catch (error) {
          logger.error(`Failed to send notification to user ${user._id}:`, error);
        }
      }

      // Mark notification as sent
      offer.notificationSent = true;
      await offer.save();
    }

    logger.info(`Sent ${notificationCount} today offer notifications`);
  } catch (error) {
    logger.error('Error sending today offer notifications:', error);
  }
};

// Function to reset notification sent flag daily (run at midnight)
exports.resetTodayOfferNotifications = async () => {
  try {
    await Coupon.updateMany(
      { offerType: 'today_offer' },
      { $set: { notificationSent: false } }
    );
    logger.info('Reset today offer notification flags');
  } catch (error) {
    logger.error('Error resetting today offer notifications:', error);
  }
};

// Get active today's offers for a user
exports.getActiveTodayOffers = async (req, res, next) => {
  try {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayOffers = await Coupon.find({
      offerType: 'today_offer',
      status: 'active',
      isActive: true,
      'dateRange.startDate': { $lte: currentDate },
      'dateRange.endDate': { $gte: currentDate },
    })
      .populate('products', 'productName thumbnail actualPrice regularPrice salePrice')
      .populate('categories', 'name')
      .sort({ createdAt: -1 });

    // Filter offers that are active at current time
    const activeOffers = todayOffers.filter(offer => {
      if (!offer.timeRange || !offer.timeRange.startTime || !offer.timeRange.endTime) {
        return true;
      }
      return currentTime >= offer.timeRange.startTime && currentTime <= offer.timeRange.endTime;
    });

    // Add countdown timer to each offer
    const offersWithCountdown = activeOffers.map(offer => {
      const offerObj = offer.toObject();
      const endTime = offer.timeRange?.endTime || '23:59:59';
      const [endHour, endMinute] = endTime.split(':').map(Number);
      const endDateTime = new Date(now);
      endDateTime.setHours(endHour, endMinute, 0, 0);
      
      if (endDateTime < now) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      const countdownMs = endDateTime - now;
      const hours = Math.floor(countdownMs / (1000 * 60 * 60));
      const minutes = Math.floor((countdownMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((countdownMs % (1000 * 60)) / 1000);

      offerObj.countdown = {
        hours,
        minutes,
        seconds,
        endTime: endDateTime.toISOString(),
      };

      return offerObj;
    });

    res.status(200).json({
      success: true,
      count: offersWithCountdown.length,
      data: offersWithCountdown,
    });
  } catch (error) {
    logger.error('Get active today offers error:', error);
    next(error);
  }
};

