const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const logger = require('../../utils/logger');
const { getDateRange } = require('./analyticsUtils');

/**
 * Get admin dashboard analytics
 */
exports.getAdminDashboard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { period = 'month' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
    };

    // Total revenue
    const revenueData = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.total' },
          totalDiscount: { $sum: '$pricing.discount' },
          totalTax: { $sum: '$pricing.tax' },
          totalShipping: { $sum: { $ifNull: ['$pricing.shipping', 0] } },
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

    // Top vendors by revenue
    const topVendors = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.vendor',
          totalRevenue: { $sum: '$items.totalPrice' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: '$items.quantity' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    // Get vendor details
    const vendorIds = topVendors.map((v) => v._id);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } })
      .select('vendorName storeName contactNumber isActive')
      .lean();

    const vendorMap = {};
    vendors.forEach((v) => {
      vendorMap[v._id.toString()] = v;
    });

    // Top products
    const topProducts = await Order.aggregate([
      { $match: orderQuery },
      { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
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

    // Revenue by date
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

    // User statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const newUsers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Vendor statistics
    const totalVendors = await Vendor.countDocuments();
    const activeVendors = await Vendor.countDocuments({ isActive: true });
    const newVendors = await Vendor.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Product statistics
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ isActive: true });
    const approvedProducts = await Product.countDocuments({
      approvalStatus: 'approved',
      isActive: true,
    });
    const pendingProducts = await Product.countDocuments({
      approvalStatus: 'pending',
    });

    const analytics = {
      period,
      dateRange: {
        startDate,
        endDate,
      },
      revenue: {
        total: revenueData[0]?.totalRevenue || 0,
        totalOrders: revenueData[0]?.totalOrders || 0,
        averageOrderValue: revenueData[0]?.averageOrderValue || 0,
        totalDiscount: revenueData[0]?.totalDiscount || 0,
        totalTax: revenueData[0]?.totalTax || 0,
        totalShipping: revenueData[0]?.totalShipping || 0,
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
      users: {
        total: totalUsers,
        active: activeUsers,
        new: newUsers,
      },
      vendors: {
        total: totalVendors,
        active: activeVendors,
        new: newVendors,
        topVendors: topVendors.map((item) => ({
          vendorId: item._id,
          vendorName: vendorMap[item._id.toString()]?.vendorName,
          storeName: vendorMap[item._id.toString()]?.storeName,
          contactNumber: vendorMap[item._id.toString()]?.contactNumber,
          isActive: vendorMap[item._id.toString()]?.isActive,
          totalRevenue: item.totalRevenue,
          totalOrders: item.totalOrders,
          totalItems: item.totalItems,
        })),
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        approved: approvedProducts,
        pending: pendingProducts,
        topProducts: topProducts.map((item) => ({
          productId: item._id,
          productName: item.productName,
          totalQuantity: item.totalQuantity,
          totalRevenue: item.totalRevenue,
          orderCount: item.orderCount,
        })),
      },
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
    logger.error('Admin dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin analytics',
    });
  }
};

/**
 * Get admin sales analytics
 */
exports.getAdminSales = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { period = 'month', groupBy = 'day', vendorId } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled', 'refunded'] },
    };

    if (vendorId) {
      orderQuery['items.vendor'] = new mongoose.Types.ObjectId(vendorId);
    }

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
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] },
              },
            },
          },
          averageOrderValue: { $avg: '$pricing.total' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        groupBy,
        vendorId: vendorId || null,
        sales: salesData.map((item) => ({
          period: item._id,
          revenue: item.revenue,
          orders: item.orders,
          itemsSold: item.itemsSold,
          averageOrderValue: item.averageOrderValue,
        })),
      },
    });
  } catch (error) {
    logger.error('Admin sales analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales analytics',
    });
  }
};

/**
 * Get admin vendor analytics
 */
exports.getAdminVendorAnalytics = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { period = 'month', limit = 20 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled', 'refunded'] },
    };

    const vendorAnalytics = await Order.aggregate([
      { $match: orderQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.vendor',
          totalRevenue: { $sum: '$items.totalPrice' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: '$items.quantity' },
          averageOrderValue: { $avg: '$items.totalPrice' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) },
    ]);

    const vendorIds = vendorAnalytics.map((v) => v._id);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } })
      .select('vendorName storeName contactNumber email isActive createdAt')
      .lean();

    const vendorMap = {};
    vendors.forEach((v) => {
      vendorMap[v._id.toString()] = v;
    });

    const analyticsData = vendorAnalytics.map((item) => ({
      vendorId: item._id,
      vendorName: vendorMap[item._id.toString()]?.vendorName,
      storeName: vendorMap[item._id.toString()]?.storeName,
      contactNumber: vendorMap[item._id.toString()]?.contactNumber,
      email: vendorMap[item._id.toString()]?.email,
      isActive: vendorMap[item._id.toString()]?.isActive,
      metrics: {
        totalRevenue: item.totalRevenue,
        totalOrders: item.totalOrders,
        totalItems: item.totalItems,
        averageOrderValue: item.averageOrderValue,
      },
    }));

    res.status(200).json({
      success: true,
      data: {
        period,
        vendors: analyticsData,
      },
    });
  } catch (error) {
    logger.error('Admin vendor analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor analytics',
    });
  }
};

/**
 * Get admin product analytics
 */
exports.getAdminProductAnalytics = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { period = 'month', limit = 20 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const orderQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled', 'refunded'] },
    };

    const productAnalytics = await Order.aggregate([
      { $match: orderQuery },
      { $unwind: '$items' },
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

    const productIds = productAnalytics.map((p) => p._id);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('productName thumbnail vendor approvalStatus isActive')
      .populate('vendor', 'vendorName storeName')
      .lean();

    const productMap = {};
    products.forEach((p) => {
      productMap[p._id.toString()] = p;
    });

    const analyticsData = productAnalytics.map((item) => ({
      productId: item._id,
      productName: item.productName,
      thumbnail: productMap[item._id.toString()]?.thumbnail,
      vendor: productMap[item._id.toString()]?.vendor,
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
        products: analyticsData,
      },
    });
  } catch (error) {
    logger.error('Admin product analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product analytics',
    });
  }
};

/**
 * Get admin dashboard overview
 */
exports.getAdminDashboardOverview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setMonth(now.getMonth() - 1);

    // Import required models
    const Rider = require('../../models/Rider');
    const Ticket = require('../../models/Ticket');

    // 1. Total Orders
    const totalOrders = await Order.countDocuments();
    const newOrders = await Order.countDocuments({
      status: { $in: ['pending', 'confirmed'] },
      createdAt: { $gte: todayStart },
    });
    const pendingOrders = await Order.countDocuments({
      status: 'pending',
    });

    // Calculate order increase percentage
    const lastMonthStart = new Date(now);
    lastMonthStart.setMonth(now.getMonth() - 2);
    const lastMonthEnd = new Date(now);
    lastMonthEnd.setMonth(now.getMonth() - 1);
    
    const thisMonthOrders = await Order.countDocuments({
      createdAt: { $gte: monthStart, $lte: now },
    });
    const lastMonthOrders = await Order.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });
    const orderIncreasePercent = lastMonthOrders > 0 
      ? ((thisMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(1)
      : thisMonthOrders > 0 ? 100 : 0;

    // 2. Total Vendors
    const totalVendors = await Vendor.countDocuments();
    const activeVendors = await Vendor.countDocuments({ isActive: true });
    const newVendors = await Vendor.countDocuments({
      createdAt: { $gte: monthStart },
    });

    // Calculate vendor increase percentage
    const thisMonthVendors = await Vendor.countDocuments({
      createdAt: { $gte: monthStart, $lte: now },
    });
    const lastMonthVendors = await Vendor.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });
    const vendorIncreasePercent = lastMonthVendors > 0
      ? ((thisMonthVendors - lastMonthVendors) / lastMonthVendors * 100).toFixed(1)
      : thisMonthVendors > 0 ? 100 : 0;

    // 3. Total Riders
    const totalRiders = await Rider.countDocuments();
    const onlineRiders = await Rider.countDocuments({
      isActive: true,
      approvalStatus: 'approved',
    });
    
    // Riders currently delivering
    const deliveringRiders = await Order.distinct('rider', {
      status: 'out_for_delivery',
    });
    const deliveringRidersCount = deliveringRiders ? deliveringRiders.length : 0;

    // Calculate rider increase percentage
    const thisMonthRiders = await Rider.countDocuments({
      createdAt: { $gte: monthStart, $lte: now },
    });
    const lastMonthRiders = await Rider.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });
    const riderIncreasePercent = lastMonthRiders > 0
      ? ((thisMonthRiders - lastMonthRiders) / lastMonthRiders * 100).toFixed(1)
      : thisMonthRiders > 0 ? 100 : 0;

    // 4. Total Users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const newUsers = await User.countDocuments({
      createdAt: { $gte: monthStart },
    });

    // Calculate user increase percentage
    const thisMonthUsers = await User.countDocuments({
      createdAt: { $gte: monthStart, $lte: now },
    });
    const lastMonthUsers = await User.countDocuments({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
    });
    const userIncreasePercent = lastMonthUsers > 0
      ? ((thisMonthUsers - lastMonthUsers) / lastMonthUsers * 100).toFixed(1)
      : thisMonthUsers > 0 ? 100 : 0;

    // 5. Inventory Statistics
    const totalProducts = await Product.countDocuments();
    const inStockProducts = await Product.countDocuments({
      inventory: { $gt: 10 },
      isActive: true,
    });
    const lowStockProducts = await Product.countDocuments({
      inventory: { $gt: 0, $lte: 10 },
      isActive: true,
    });
    const outOfStockProducts = await Product.countDocuments({
      $or: [
        { inventory: 0 },
        { inventory: { $exists: false } }
      ],
      isActive: true,
    });

    // 6. Revenue Statistics
    const todayRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
        },
      },
    ]);

    const weekRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: weekStart },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
        },
      },
    ]);

    const monthRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
        },
      },
    ]);

    // Calculate revenue increase percentage
    const lastMonthRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
        },
      },
    ]);

    const currentMonthRevenue = monthRevenue[0]?.total || 0;
    const previousMonthRevenue = lastMonthRevenue[0]?.total || 0;
    const revenueIncreasePercent = previousMonthRevenue > 0
      ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue * 100).toFixed(1)
      : currentMonthRevenue > 0 ? 100 : 0;

    // 7. Notifications (Placeholder)
    const unreadNotifications = 15;

    // 8. Support Tickets
    const openTickets = await Ticket.countDocuments({ status: 'active' });
    const inProgressTickets = await Ticket.countDocuments({ status: 'pending' });
    const escalatedTickets = await Ticket.countDocuments({
      status: { $in: ['active', 'pending'] },
      createdAt: { $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    const resolvedTickets = await Ticket.countDocuments({ status: 'resolved' });

    // 9. Recent Orders (Last 10)
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber user pricing.total status createdAt')
      .populate('user', 'fullName contactNumber')
      .lean();

    // 10. Top Vendors (by order count)
    const topVendorsData = await Order.aggregate([
      {
        $match: {
          status: { $nin: ['cancelled', 'refunded'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.vendor',
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 },
    ]);

    const vendorIds = topVendorsData.map((v) => v._id);
    const topVendorsDetails = await Vendor.find({ _id: { $in: vendorIds } })
      .select('vendorName storeName')
      .lean();

    const vendorMap = {};
    topVendorsDetails.forEach((v) => {
      vendorMap[v._id.toString()] = v;
    });

    const topVendors = topVendorsData.map((item, index) => ({
      rank: index + 1,
      vendorId: item._id,
      vendorName: vendorMap[item._id.toString()]?.vendorName || 'Unknown',
      storeName: vendorMap[item._id.toString()]?.storeName || 'Unknown',
      orders: item.orderCount,
    }));

    // Format response
    const dashboardData = {
      summary: {
        newOrders: newOrders,
        pendingOrders: pendingOrders,
      },
      metrics: {
        totalOrders: {
          total: totalOrders,
          new: newOrders,
          pending: pendingOrders,
          increasePercent: parseFloat(orderIncreasePercent),
        },
        totalVendors: {
          total: totalVendors,
          active: activeVendors,
          new: newVendors,
          increasePercent: parseFloat(vendorIncreasePercent),
        },
        totalRiders: {
          total: totalRiders,
          online: onlineRiders,
          delivering: deliveringRidersCount,
          increasePercent: parseFloat(riderIncreasePercent),
        },
        totalUsers: {
          total: totalUsers,
          active: activeUsers,
          new: newUsers,
          increasePercent: parseFloat(userIncreasePercent),
        },
      },
      inventory: {
        totalProducts: totalProducts,
        inStock: inStockProducts,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts,
      },
      revenue: {
        today: todayRevenue[0]?.total || 0,
        thisWeek: weekRevenue[0]?.total || 0,
        thisMonth: monthRevenue[0]?.total || 0,
        increasePercent: parseFloat(revenueIncreasePercent),
      },
      notifications: {
        unread: unreadNotifications,
        message: 'You have pending notifications',
      },
      supportTickets: {
        open: openTickets,
        inProgress: inProgressTickets,
        escalated: escalatedTickets,
        resolved: resolvedTickets,
      },
      recentOrders: recentOrders.map((order) => ({
        orderId: order.orderNumber,
        customer: order.user ? `${order.user.fullName || 'Unknown'}` : 'Unknown',
        amount: order.pricing.total,
        status: order.status,
      })),
      topVendors: topVendors,
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    logger.error('Admin dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard overview',
      message: error.message,
    });
  }
};
