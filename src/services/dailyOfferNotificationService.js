const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const { addNotificationJob } = require('../utils/queue');
const logger = require('../utils/logger');

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

/**
 * Get user's default location (from default address or first address with location)
 */
const getUserLocation = (user) => {
  // Check for default address first
  const defaultAddress = user.addresses?.find(addr => addr.isDefault && addr.latitude && addr.longitude);
  if (defaultAddress) {
    return {
      latitude: defaultAddress.latitude,
      longitude: defaultAddress.longitude,
      city: defaultAddress.city,
      state: defaultAddress.state,
    };
  }

  // Check main address
  if (user.address?.latitude && user.address?.longitude) {
    return {
      latitude: user.address.latitude,
      longitude: user.address.longitude,
      city: user.address.city,
      state: user.address.state,
    };
  }

  // Check first address with location
  const addressWithLocation = user.addresses?.find(addr => addr.latitude && addr.longitude);
  if (addressWithLocation) {
    return {
      latitude: addressWithLocation.latitude,
      longitude: addressWithLocation.longitude,
      city: addressWithLocation.city,
      state: addressWithLocation.state,
    };
  }

  return null;
};

/**
 * Find vendors within user's location radius
 */
const findNearbyVendors = async (userLat, userLon, maxRadius = 10) => {
  try {
    // Get all active vendors with location
    const vendors = await Vendor.find({
      isActive: true,
      storeAddress: {
        $exists: true,
      },
      'storeAddress.latitude': { $exists: true, $ne: null },
      'storeAddress.longitude': { $exists: true, $ne: null },
    }).select('_id vendorName storeName storeAddress serviceRadius');

    const nearbyVendors = vendors.filter(vendor => {
      const vendorLat = vendor.storeAddress?.latitude;
      const vendorLon = vendor.storeAddress?.longitude;
      const serviceRadius = vendor.serviceRadius || 5; // Default 5km if not set

      if (!vendorLat || !vendorLon) {
        return false;
      }

      const distance = calculateDistance(userLat, userLon, vendorLat, vendorLon);
      return distance <= Math.max(serviceRadius, maxRadius);
    });

    return nearbyVendors.map(v => v._id);
  } catch (error) {
    logger.error('Error finding nearby vendors:', error);
    return [];
  }
};

/**
 * Get daily offers from specific vendors
 */
const getDailyOffersFromVendors = async (vendorIds) => {
  try {
    const now = new Date();

    const products = await Product.find({
      vendor: { $in: vendorIds },
      approvalStatus: 'approved',
      isActive: true,
      offerEnabled: true,
      isDailyOffer: true,
      $or: [
        { offerStartDate: { $exists: false } },
        { offerStartDate: null },
        { offerStartDate: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { offerEndDate: { $exists: false } },
            { offerEndDate: null },
            { offerEndDate: { $gte: now } },
          ],
        },
      ],
    })
      .populate('vendor', 'vendorName storeName')
      .populate('category', 'categoryName')
      .select('productName salePrice regularPrice offerDiscountPercentage vendor category thumbnail')
      .limit(10) // Limit to top 10 offers per user
      .lean();

    return products;
  } catch (error) {
    logger.error('Error getting daily offers from vendors:', error);
    return [];
  }
};

/**
 * Send daily offer notification to a user
 */
const sendDailyOfferNotification = async (userId, offers) => {
  try {
    if (!offers || offers.length === 0) {
      return { success: false, reason: 'No offers available' };
    }

    // Group offers by vendor
    const vendorGroups = {};
    offers.forEach(offer => {
      const vendorId = offer.vendor?._id?.toString() || 'unknown';
      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = {
          vendor: offer.vendor,
          offers: [],
        };
      }
      vendorGroups[vendorId].offers.push(offer);
    });

    // Create notification message
    const vendorCount = Object.keys(vendorGroups).length;
    const offerCount = offers.length;
    
    let message = `🔥 Daily Offers Alert!\n\n`;
    message += `Found ${offerCount} special offer${offerCount > 1 ? 's' : ''} from ${vendorCount} nearby vendor${vendorCount > 1 ? 's' : ''}!\n\n`;

    // Add top 3 offers to message
    const topOffers = offers.slice(0, 3);
    topOffers.forEach((offer, index) => {
      const discount = offer.offerDiscountPercentage || 0;
      const vendorName = offer.vendor?.storeName || offer.vendor?.vendorName || 'Vendor';
      message += `${index + 1}. ${offer.productName} - ${discount}% OFF at ${vendorName}\n`;
    });

    if (offers.length > 3) {
      message += `\n+ ${offers.length - 3} more offers available!`;
    }

    message += `\n\nCheck out all daily offers now!`;

    // Add notification to queue
    await addNotificationJob({
      userId: userId,
      type: 'daily_offer',
      title: '🔥 Daily Offers Near You!',
      message: message,
      data: {
        offerCount: offerCount,
        vendorCount: vendorCount,
        offers: offers.map(offer => ({
          productId: offer._id,
          productName: offer.productName,
          discountPercentage: offer.offerDiscountPercentage,
          salePrice: offer.salePrice,
          regularPrice: offer.regularPrice,
          vendorId: offer.vendor?._id,
          vendorName: offer.vendor?.storeName || offer.vendor?.vendorName,
          categoryName: offer.category?.categoryName,
          thumbnail: offer.thumbnail?.url,
        })),
      },
    });

    return { success: true, offerCount, vendorCount };
  } catch (error) {
    logger.error(`Error sending daily offer notification to user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Main function to send daily offer notifications to all users
 * This runs every 30 minutes
 */
const sendDailyOfferNotificationsToUsers = async () => {
  try {
    logger.info('Starting daily offer notification process...');
    
    const startTime = Date.now();
    let totalUsersProcessed = 0;
    let totalNotificationsSent = 0;
    let totalUsersSkipped = 0;
    let totalErrors = 0;

    // Get all active users with location data
    const users = await User.find({
      isActive: true,
    }).select('_id addresses address contactNumber');

    logger.info(`Found ${users.length} active users to process`);

    // Process users in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (user) => {
          try {
            // Get user location
            const userLocation = getUserLocation(user);
            
            if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
              totalUsersSkipped++;
              logger.debug(`Skipping user ${user._id}: No location data`);
              return;
            }

            // Find nearby vendors
            const nearbyVendorIds = await findNearbyVendors(
              userLocation.latitude,
              userLocation.longitude,
              10 // 10km max radius
            );

            if (nearbyVendorIds.length === 0) {
              totalUsersSkipped++;
              logger.debug(`Skipping user ${user._id}: No nearby vendors`);
              return;
            }

            // Get daily offers from nearby vendors
            const offers = await getDailyOffersFromVendors(nearbyVendorIds);

            if (offers.length === 0) {
              totalUsersSkipped++;
              logger.debug(`Skipping user ${user._id}: No daily offers available`);
              return;
            }

            // Send notification
            const result = await sendDailyOfferNotification(user._id, offers);
            
            if (result.success) {
              totalNotificationsSent++;
              logger.info(
                `Notification sent to user ${user._id}: ${result.offerCount} offers from ${result.vendorCount} vendors`
              );
            } else {
              totalErrors++;
              logger.warn(`Failed to send notification to user ${user._id}: ${result.reason || result.error}`);
            }

            totalUsersProcessed++;
          } catch (error) {
            totalErrors++;
            logger.error(`Error processing user ${user._id}:`, error);
          }
        })
      );

      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(
      `Daily offer notification process completed in ${duration}s. ` +
      `Processed: ${totalUsersProcessed}, Sent: ${totalNotificationsSent}, ` +
      `Skipped: ${totalUsersSkipped}, Errors: ${totalErrors}`
    );

    return {
      success: true,
      processed: totalUsersProcessed,
      sent: totalNotificationsSent,
      skipped: totalUsersSkipped,
      errors: totalErrors,
      duration: parseFloat(duration),
    };
  } catch (error) {
    logger.error('Error in daily offer notification process:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  sendDailyOfferNotificationsToUsers,
  getUserLocation,
  findNearbyVendors,
  getDailyOffersFromVendors,
  sendDailyOfferNotification,
};
