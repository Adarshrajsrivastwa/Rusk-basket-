const Product = require('../models/Product');
const logger = require('../utils/logger');

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
