const { validationResult } = require('express-validator');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Vendor = require('../../models/Vendor');
const Rider = require('../../models/Rider');
const logger = require('../../utils/logger');
const { getDateRange } = require('./analyticsUtils');

/**
 * Get vendor dashboard analytics
 */
exports.getVendorDashboard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { period = 'month' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Build query for vendor orders
    const orderQuery = {
      'items.vendor': vendorId,
      createdAt: { $gte: startDate, $lte: endDate },
    };

    // Total revenue for the period
    const revenueData = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.total' },
        },
      },
    ]);

    // All-time total revenue (for vendor)
    const allTimeRevenueData = await Order.aggregate([
      { $match: { 'items.vendor': vendorId } },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.total' },
          totalOrders: { $sum: 1 },
        },
      },
    ]);

    // Revenue from items (vendor's items only)
    const itemRevenueData = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: null,
          totalItemRevenue: { $sum: '$items.totalPrice' },
          totalItemsSold: { $sum: '$items.quantity' },
          totalCashback: { $sum: '$items.cashback' },
        },
      },
    ]);

    // Order status distribution
    const statusDistribution = await Order.aggregate([
      { $match: orderQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
        },
      },
    ]);

    // Payment method distribution
    const paymentMethodDistribution = await Order.aggregate([
      { $match: orderQuery },
      {
        $group: {
          _id: '$payment.method',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
        },
      },
    ]);

    // Top products
    const topProducts = await Order.aggregate([
      { $match: orderQuery },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    // Revenue by date (for charts)
    const revenueByDate = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Total products count
    const totalProducts = await Product.countDocuments({
      vendor: vendorId,
      isActive: true,
    });

    // Approved products count
    const approvedProducts = await Product.countDocuments({
      vendor: vendorId,
      approvalStatus: 'approved',
      isActive: true,
    });

    const analytics = {
      period,
      dateRange: {
        startDate,
        endDate,
      },
      revenue: {
        // Period revenue
        total: revenueData[0]?.totalRevenue || 0,
        totalOrders: revenueData[0]?.totalOrders || 0,
        averageOrderValue: revenueData[0]?.averageOrderValue || 0,
        // All-time revenue
        allTimeTotal: allTimeRevenueData[0]?.totalRevenue || 0,
        allTimeTotalOrders: allTimeRevenueData[0]?.totalOrders || 0,
        // Item-level revenue
        totalItemRevenue: itemRevenueData[0]?.totalItemRevenue || 0,
        totalItemsSold: itemRevenueData[0]?.totalItemsSold || 0,
        totalCashback: itemRevenueData[0]?.totalCashback || 0,
      },
      orders: {
        statusDistribution: statusDistribution.map((item) => ({
          status: item._id,
          count: item.count,
          revenue: item.revenue,
        })),
        paymentMethodDistribution: paymentMethodDistribution.map((item) => ({
          method: item._id,
          count: item.count,
          revenue: item.revenue,
        })),
      },
      products: {
        total: totalProducts,
        approved: approvedProducts,
        pending: totalProducts - approvedProducts,
      },
      topProducts: topProducts.map((item) => ({
        productId: item._id,
        productName: item.productName,
        totalQuantity: item.totalQuantity,
        totalRevenue: item.totalRevenue,
        orderCount: item.orderCount,
      })),
      revenueByDate: revenueByDate.map((item) => ({
        date: item._id,
        revenue: item.revenue,
        orders: item.orders,
      })),
    };

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Vendor dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor analytics',
    });
  }
};

/**
 * Get vendor sales analytics
 */
exports.getVendorSales = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { period = 'month', groupBy = 'day' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      'items.vendor': vendorId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled', 'refunded'] },
    };

    let dateFormat;
    switch (groupBy) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%U';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    const salesData = await Order.aggregate([
      { $match: orderQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: '$createdAt' },
          },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 },
          itemsSold: {
            $sum: {
              $reduce: {
                input: {
                  $filter: {
                    input: '$items',
                    as: 'item',
                    cond: { $eq: ['$$item.vendor', vendorId] },
                  },
                },
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] },
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        groupBy,
        sales: salesData.map((item) => ({
          period: item._id,
          revenue: item.revenue,
          orders: item.orders,
          itemsSold: item.itemsSold,
        })),
      },
    });
  } catch (error) {
    logger.error('Vendor sales analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales analytics',
    });
  }
};

/**
 * Get vendor product performance
 */
exports.getVendorProductPerformance = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const { period = 'month', limit = 20 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      'items.vendor': vendorId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled', 'refunded'] },
    };

    const productPerformance = await Order.aggregate([
      { $match: orderQuery },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' },
          averagePrice: { $avg: '$items.salePrice' },
          orderCount: { $sum: 1 },
          totalCashback: { $sum: '$items.cashback' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Get product details
    const productIds = productPerformance.map((p) => p._id);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('productName thumbnail approvalStatus isActive')
      .lean();

    const productMap = {};
    products.forEach((p) => {
      productMap[p._id.toString()] = p;
    });

    const performanceData = productPerformance.map((item) => ({
      productId: item._id,
      productName: item.productName,
      thumbnail: productMap[item._id.toString()]?.thumbnail,
      approvalStatus: productMap[item._id.toString()]?.approvalStatus,
      isActive: productMap[item._id.toString()]?.isActive,
      metrics: {
        totalQuantity: item.totalQuantity,
        totalRevenue: item.totalRevenue,
        averagePrice: item.averagePrice,
        orderCount: item.orderCount,
        totalCashback: item.totalCashback,
      },
    }));

    res.status(200).json({
      success: true,
      data: {
        period,
        products: performanceData,
      },
    });
  } catch (error) {
    logger.error('Vendor product performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product performance',
    });
  }
};

/**
 * Get vendor overview dashboard
 */
exports.getVendorOverview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now);
    monthStart.setMonth(now.getMonth() - 1);
    const lastMonthStart = new Date(now);
    lastMonthStart.setMonth(now.getMonth() - 2);
    const lastMonthEnd = new Date(now);
    lastMonthEnd.setMonth(now.getMonth() - 1);

    // 1. Total Revenue (Current Month)
    const currentMonthRevenue = await Order.aggregate([
      {
        $match: {
          'items.vendor': vendorId,
          createdAt: { $gte: monthStart, $lte: now },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: '$items.totalPrice' },
        },
      },
    ]);

    const previousMonthRevenue = await Order.aggregate([
      {
        $match: {
          'items.vendor': vendorId,
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: '$items.totalPrice' },
        },
      },
    ]);

    const revenue = currentMonthRevenue[0]?.total || 0;
    const prevRevenue = previousMonthRevenue[0]?.total || 0;
    const revenueIncreasePercent = prevRevenue > 0
      ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(1)
      : revenue > 0 ? 100 : 0;

    // 2. Total Orders (Current Month)
    const currentMonthOrders = await Order.countDocuments({
      'items.vendor': vendorId,
      createdAt: { $gte: monthStart, $lte: now },
    });

    const previousMonthOrders = await Order.countDocuments({
      'items.vendor': vendorId,
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });

    const orderIncreasePercent = previousMonthOrders > 0
      ? ((currentMonthOrders - previousMonthOrders) / previousMonthOrders * 100).toFixed(1)
      : currentMonthOrders > 0 ? 100 : 0;

    // 3. Products Count
    const totalProducts = await Product.countDocuments({
      vendor: vendorId,
      isActive: true,
    });

    const previousMonthProducts = await Product.countDocuments({
      vendor: vendorId,
      isActive: true,
      createdAt: { $lte: lastMonthEnd },
    });

    const productIncrease = totalProducts - previousMonthProducts;

    // 4. Growth (Overall revenue growth percentage)
    const allTimeRevenue = await Order.aggregate([
      {
        $match: {
          'items.vendor': vendorId,
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: '$items.totalPrice' },
        },
      },
    ]);

    const allTimeTotal = allTimeRevenue[0]?.total || 0;
    const previousAllTimeRevenue = await Order.aggregate([
      {
        $match: {
          'items.vendor': vendorId,
          createdAt: { $lte: lastMonthEnd },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      { $unwind: '$items' },
      { $match: { 'items.vendor': vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: '$items.totalPrice' },
        },
      },
    ]);

    const previousAllTimeTotal = previousAllTimeRevenue[0]?.total || 0;
    const growthPercent = previousAllTimeTotal > 0
      ? ((allTimeTotal - previousAllTimeTotal) / previousAllTimeTotal * 100).toFixed(1)
      : allTimeTotal > 0 ? 100 : 0;

    // 5. Recent Orders (Last 5 orders with vendor items)
    const recentOrdersData = await Order.find({
      'items.vendor': vendorId,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber user pricing.total status createdAt items')
      .populate('user', 'fullName contactNumber')
      .lean();

    const recentOrders = [];
    const vendorIdStr = vendorId.toString();
    for (const order of recentOrdersData) {
      // Get the first vendor item from this order
      const vendorItem = order.items.find(item => {
        if (!item.vendor) return false;
        const itemVendorId = item.vendor.toString ? item.vendor.toString() : String(item.vendor);
        return itemVendorId === vendorIdStr;
      });
      
      if (vendorItem) {
        const amount = vendorItem.totalPrice || 0;
        recentOrders.push({
          orderId: order.orderNumber,
          customer: order.user ? `${order.user.fullName || 'Unknown'}` : 'Unknown',
          product: vendorItem.productName || 'Unknown Product',
          amount: amount,
          formattedAmount: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          status: order.status,
        });
      }
    }

    // 6. Low Stock Alert (Products with inventory <= 10)
    // First get all active products for the vendor
    const allProducts = await Product.find({
      vendor: vendorId,
      isActive: true,
    })
      .select('productName skus skuHsn inventory')
      .lean();

    const lowStockItems = [];
    for (const product of allProducts) {
      // Check main inventory
      if (product.inventory && product.inventory > 0 && product.inventory <= 10) {
        lowStockItems.push({
          productName: product.productName,
          sku: product.skuHsn || 'SKU-001',
          stock: product.inventory,
        });
      }
      
      // Check SKU inventory
      if (product.skus && Array.isArray(product.skus)) {
        for (const sku of product.skus) {
          if (sku.inventory > 0 && sku.inventory <= 10) {
            lowStockItems.push({
              productName: product.productName,
              sku: sku.sku || product.skuHsn || 'SKU-001',
              stock: sku.inventory,
            });
          }
        }
      }
    }

    // Limit to top 3 low stock items
    const topLowStockItems = lowStockItems.slice(0, 3);

    // Format response matching the dashboard design
    const overviewData = {
      metrics: {
        totalRevenue: {
          value: revenue.toFixed(2),
          formattedValue: `$${revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          change: `+${revenueIncreasePercent}%`,
          changeType: parseFloat(revenueIncreasePercent) >= 0 ? 'positive' : 'negative',
        },
        totalOrders: {
          value: currentMonthOrders,
          formattedValue: currentMonthOrders.toLocaleString('en-US'),
          change: `+${orderIncreasePercent}%`,
          changeType: parseFloat(orderIncreasePercent) >= 0 ? 'positive' : 'negative',
        },
        products: {
          value: totalProducts,
          formattedValue: totalProducts.toString(),
          change: productIncrease > 0 ? `+${productIncrease}` : productIncrease.toString(),
          changeType: productIncrease >= 0 ? 'positive' : 'negative',
        },
        growth: {
          value: `${growthPercent}%`,
          formattedValue: `${growthPercent}%`,
          change: `+${revenueIncreasePercent}%`,
          changeType: parseFloat(revenueIncreasePercent) >= 0 ? 'positive' : 'negative',
        },
      },
      recentOrders: recentOrders,
      lowStockAlert: topLowStockItems,
    };

    res.status(200).json({
      success: true,
      data: overviewData,
    });
  } catch (error) {
    logger.error('Vendor overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor overview',
      message: error.message,
    });
  }
};

/**
 * Get vendors with associated riders who have no current orders
 * Returns list of vendors with their riders that currently have no orders ingested
 */
exports.getVendorsWithRidersNoOrders = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    // Get vendor ID from request (if vendor is making the request, show only their data)
    const vendorId = req.vendor ? req.vendor._id : null;

    // Build query for vendors
    const vendorQuery = {
      isActive: true,
      storeId: { $exists: true, $ne: null },
    };

    // If vendor is making request, filter to their own data
    if (vendorId) {
      vendorQuery._id = vendorId;
    }

    // Get all active vendors
    const vendors = await Vendor.find(vendorQuery)
      .select('_id vendorName storeId storeName contactNumber email')
      .lean();

    const result = [];

    // For each vendor, get associated riders and check for orders
    for (const vendor of vendors) {
      // Get all riders associated with this vendor
      const riders = await Rider.find({
        vendor: vendor._id,
        isActive: true,
        approvalStatus: 'approved',
      })
        .select('_id fullName mobileNumber')
        .lean();

      const ridersWithNoOrders = [];

      // Check each rider for current orders
      for (const rider of riders) {
        // Check if rider has any active orders (not cancelled or refunded)
        const hasActiveOrders = await Order.exists({
          rider: rider._id,
          status: { $nin: ['cancelled', 'refunded'] },
        });

        // If rider has no active orders, add to list
        if (!hasActiveOrders) {
          ridersWithNoOrders.push({
            riderId: rider._id,
            fullName: rider.fullName || 'N/A',
            mobileNumber: rider.mobileNumber || 'N/A',
          });
        }
      }

      // Only include vendor if they have riders with no orders
      if (ridersWithNoOrders.length > 0) {
        result.push({
          vendorId: vendor._id,
          vendorName: vendor.vendorName || 'N/A',
          storeId: vendor.storeId || 'N/A',
          storeName: vendor.storeName || 'N/A',
          contactNumber: vendor.contactNumber || 'N/A',
          email: vendor.email || 'N/A',
          riders: ridersWithNoOrders,
          totalRidersWithNoOrders: ridersWithNoOrders.length,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        vendors: result,
        totalVendors: result.length,
        totalRidersWithNoOrders: result.reduce((sum, vendor) => sum + vendor.totalRidersWithNoOrders, 0),
      },
    });
  } catch (error) {
    logger.error('Get vendors with riders no orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendors with riders having no orders',
      message: error.message,
    });
  }
};
