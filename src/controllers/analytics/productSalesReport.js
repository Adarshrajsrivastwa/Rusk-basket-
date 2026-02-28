const mongoose = require('mongoose');
const Order = require('../../models/Order');
const logger = require('../../utils/logger');

/**
 * Get Product Sales Report for GST/Sales compliance
 * Returns Sr no, Product name, HSN code, GST slab, Quantity, Sales price, Total amount
 * according to date wise from both admin and vendor side
 */
exports.getProductSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, vendorId } = req.query;

        const matchQuery = {
            status: { $nin: ['cancelled', 'refunded', 'failed', 'pending'] }
        };

        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) {
                matchQuery.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                matchQuery.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
            } else if (startDate) {
                // If only start date is provided, fetch up to the current date
                matchQuery.createdAt.$lte = new Date();
            }
        } else {
            // Default to last 30 days if no date provided
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 30);
            matchQuery.createdAt = { $gte: start, $lte: end };
        }

        // Determine vendor filter (Admin vs Vendor)
        let filterVendorId = null;
        if (req.vendor) {
            filterVendorId = req.vendor._id;
        } else if (vendorId) { // Admin requests for specific vendor
            filterVendorId = new mongoose.Types.ObjectId(vendorId);
        }

        if (filterVendorId) {
            matchQuery['items.vendor'] = filterVendorId;
        }

        const pipeline = [
            { $match: matchQuery },
            { $unwind: '$items' }
        ];

        if (filterVendorId) {
            pipeline.push({
                $match: { 'items.vendor': filterVendorId }
            });
        }

        pipeline.push(
            {
                $lookup: {
                    from: 'products', // MongoDB collection name for Product model is usually lowercase plural
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            {
                $unwind: {
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        productId: '$items.product',
                        productName: '$items.productName',
                        salePrice: '$items.salePrice',
                        hsnCode: '$productDetails.skuHsn',
                        gstSlab: '$productDetails.tax' // GST percentage slab from Product model
                    },
                    quantity: { $sum: '$items.quantity' },
                    totalAmount: { $sum: '$items.totalPrice' } // Assuming totalPrice is qty * price
                }
            },
            {
                $sort: { '_id.date': -1, '_id.productName': 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id.date',
                    productName: '$_id.productName',
                    hsnCode: { $ifNull: ['$_id.hsnCode', 'N/A'] },
                    gstSlab: { $ifNull: ['$_id.gstSlab', 0] },
                    salePrice: '$_id.salePrice',
                    quantity: '$quantity',
                    totalAmount: '$totalAmount'
                }
            },
            {
                // Calculate GST Amount based on the percentage (assuming totalAmount is inclusive of GST)
                // gstAmount = totalAmount - (totalAmount / (1 + (gstSlab/100)))
                $addFields: {
                    gstAmount: {
                        $cond: {
                            if: { $gt: ['$gstSlab', 0] },
                            then: {
                                $round: [
                                    {
                                        $subtract: [
                                            '$totalAmount',
                                            { $divide: ['$totalAmount', { $add: [1, { $divide: ['$gstSlab', 100] }] }] }
                                        ]
                                    },
                                    2 // Round to 2 decimal places
                                ]
                            },
                            else: 0
                        }
                    },
                    // Also calculate base amount (without GST)
                    taxableAmount: {
                        $cond: {
                            if: { $gt: ['$gstSlab', 0] },
                            then: {
                                $round: [
                                    { $divide: ['$totalAmount', { $add: [1, { $divide: ['$gstSlab', 100] }] }] },
                                    2
                                ]
                            },
                            else: '$totalAmount'
                        }
                    }
                }
            }
        );

        const reportData = await Order.aggregate(pipeline);

        // Add Sr. No. to the final result
        const formattedData = reportData.map((item, index) => ({
            srNo: index + 1,
            ...item
        }));

        res.status(200).json({
            success: true,
            count: formattedData.length,
            data: formattedData
        });

    } catch (error) {
        logger.error('Error fetching product sales report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product sales report'
        });
    }
};
