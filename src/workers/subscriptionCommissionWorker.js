const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');

/**
 * Process subscription commission deductions
 * This should run daily to check for vendors with subscription commission
 * and deduct the amount on the scheduled date
 */
exports.processSubscriptionCommissions = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get day of month (1-31) for monthly subscriptions
    const dayOfMonth = today.getDate();
    
    // Get day of year (1-365) for yearly subscriptions
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((today - startOfYear) / (1000 * 60 * 60 * 24)) + 1;

    // Find vendors with subscription commission that need deduction today
    const vendorsToProcess = await Vendor.find({
      'commission.type': 'subscription',
      'commission.subscriptionAmount': { $gt: 0 },
      $or: [
        // Monthly: deduction date matches today's day of month
        {
          'commission.subscriptionPeriod': 'monthly',
          'commission.subscriptionDeductionDate': dayOfMonth,
          $or: [
            { 'commission.nextSubscriptionDeduction': { $lte: today } },
            { 'commission.nextSubscriptionDeduction': null },
          ],
        },
        // Yearly: deduction date matches today's day of year
        {
          'commission.subscriptionPeriod': 'yearly',
          'commission.subscriptionDeductionDate': dayOfYear,
          $or: [
            { 'commission.nextSubscriptionDeduction': { $lte: today } },
            { 'commission.nextSubscriptionDeduction': null },
          ],
        },
      ],
    });

    if (vendorsToProcess.length === 0) {
      logger.info('No subscription commissions to process today');
      return {
        success: true,
        message: 'No subscription commissions to process',
        processed: 0,
      };
    }

    let successCount = 0;
    let failedCount = 0;
    const results = [];

    for (const vendor of vendorsToProcess) {
      try {
        const subscriptionAmount = vendor.commission.subscriptionAmount || 0;
        const currentBalance = vendor.earningWallet || 0;

        // Check if already deducted today (prevent duplicate)
        const todayStart = new Date(today);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const alreadyDeductedToday = vendor.walletTransactions?.some(
          txn => txn.type === 'debit' &&
                 txn.description && 
                 txn.description.includes('Subscription commission') &&
                 new Date(txn.createdAt) >= todayStart &&
                 new Date(txn.createdAt) <= todayEnd
        );

        if (alreadyDeductedToday) {
          logger.info(`Subscription commission already deducted today for vendor ${vendor._id}`);
          continue;
        }

        // Note: Wallet can go negative, no balance check needed

        // Calculate next deduction date
        const nextDeduction = new Date(today);
        if (vendor.commission.subscriptionPeriod === 'monthly') {
          nextDeduction.setMonth(nextDeduction.getMonth() + 1);
          // Ensure same day of month
          const deductionDay = vendor.commission.subscriptionDeductionDate;
          const lastDayOfMonth = new Date(nextDeduction.getFullYear(), nextDeduction.getMonth() + 1, 0).getDate();
          nextDeduction.setDate(Math.min(deductionDay, lastDayOfMonth));
        } else {
          // Yearly
          nextDeduction.setFullYear(nextDeduction.getFullYear() + 1);
        }

        // Deduct subscription amount
        const updatedVendor = await Vendor.findOneAndUpdate(
          { _id: vendor._id },
          {
            $inc: { earningWallet: -subscriptionAmount },
            $push: {
              walletTransactions: {
                type: 'debit',
                amount: subscriptionAmount,
                description: `Subscription commission ${vendor.commission.subscriptionPeriod} fee deducted. Amount: ₹${subscriptionAmount.toFixed(2)}`,
                createdAt: new Date(),
              },
            },
            $set: {
              'commission.lastSubscriptionDeduction': today,
              'commission.nextSubscriptionDeduction': nextDeduction,
            },
          },
          { new: true }
        );

        if (updatedVendor) {
          logger.info(`Subscription commission ₹${subscriptionAmount.toFixed(2)} deducted from vendor ${vendor._id} (${vendor.vendorName}). Next deduction: ${nextDeduction.toISOString()}`);
          
          results.push({
            vendorId: vendor._id,
            vendorName: vendor.vendorName,
            status: 'success',
            amount: subscriptionAmount,
            newBalance: updatedVendor.earningWallet,
            nextDeduction: nextDeduction,
          });
          successCount++;
        } else {
          failedCount++;
        }
      } catch (vendorError) {
        logger.error(`Error processing subscription commission for vendor ${vendor._id}:`, vendorError);
        failedCount++;
        results.push({
          vendorId: vendor._id,
          vendorName: vendor.vendorName,
          status: 'error',
          error: vendorError.message,
        });
      }
    }

    logger.info(`Subscription commission processing completed. Success: ${successCount}, Failed: ${failedCount}`);

    return {
      success: true,
      message: `Processed ${successCount} subscription commissions, ${failedCount} failed`,
      processed: successCount,
      failed: failedCount,
      results: results,
    };
  } catch (error) {
    logger.error('Error processing subscription commissions:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
