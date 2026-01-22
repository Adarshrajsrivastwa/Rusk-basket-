const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');

const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    case 'all':
      startDate = new Date(0);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
  }

  return { startDate, endDate: new Date() };
};

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
