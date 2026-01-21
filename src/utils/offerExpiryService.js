const Product = require('../models/Product');
const logger = require('../utils/logger');

/**
 * Process daily offers - disable expired and enable new daily offers
 * This should run daily at 5 AM
 */
exports.processDailyOffers = async () => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Disable expired daily offers
    const expiredOffers = await Product.updateMany(
      {
        isDailyOffer: true,
        offerEnabled: true,
        offerEndDate: { $exists: true, $ne: null, $lt: now },
      },
      {
        $set: {
          offerEnabled: false,
          offerStartDate: null,
          offerEndDate: null,
        },
      },
      {
        batchSize: 1000,
      }
    );

    // Enable daily offers that should be active today
    // Set offerEndDate to end of today if not set
    const dailyOffersToEnable = await Product.updateMany(
      {
        isDailyOffer: true,
        offerEnabled: false,
        offerDiscountPercentage: { $gt: 0 },
        $and: [
          {
            $or: [
              { offerStartDate: { $exists: false } },
              { offerStartDate: null },
              { offerStartDate: { $lte: now } },
            ],
          },
          {
            $or: [
              { offerEndDate: { $exists: false } },
              { offerEndDate: null },
              { offerEndDate: { $gte: today } },
            ],
          },
        ],
      },
      {
        $set: {
          offerEnabled: true,
          offerStartDate: today,
          offerEndDate: tomorrow,
        },
      },
      {
        batchSize: 1000,
      }
    );

    if (expiredOffers.modifiedCount > 0 || dailyOffersToEnable.modifiedCount > 0) {
      logger.info(`Daily offer processing completed: Disabled ${expiredOffers.modifiedCount} expired, Enabled ${dailyOffersToEnable.modifiedCount} new daily offers`, {
        service: 'daily-offer-processor',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      disabledCount: expiredOffers.modifiedCount,
      enabledCount: dailyOffersToEnable.modifiedCount,
    };
  } catch (error) {
    logger.error('Error processing daily offers:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.disableExpiredOffers = async () => {
  try {
    const now = new Date();
    
    const expiredOffers = await Product.updateMany(
      {
        offerEnabled: true,
        offerEndDate: { $exists: true, $ne: null, $lt: now },
      },
      {
        $set: {
          offerEnabled: false,
          offerStartDate: null,
          offerEndDate: null,
        },
      },
      {
        batchSize: 1000,
      }
    );

    if (expiredOffers.modifiedCount > 0) {
      logger.info(`Disabled ${expiredOffers.modifiedCount} expired offers`, {
        service: 'offer-expiry',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: true,
      disabledCount: expiredOffers.modifiedCount,
    };
  } catch (error) {
    logger.error('Error disabling expired offers:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

exports.checkAndDisableExpiredOffer = async (product) => {
  if (!product || !product.offerEnabled || !product.offerEndDate) {
    return product;
  }

  const now = new Date();
  const endDate = new Date(product.offerEndDate);

  if (now > endDate) {
    product.offerEnabled = false;
    product.offerStartDate = undefined;
    product.offerEndDate = undefined;
    await product.save();
    
    logger.info(`Disabled expired offer for product ${product._id}`, {
      service: 'offer-expiry',
      productId: product._id,
    });
  }

  return product;
};
