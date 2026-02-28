/**
 * Main analytics controller - Re-exports all analytics functions
 * This file maintains backward compatibility - all APIs remain the same
 */

// Re-export vendor analytics
const vendorAnalytics = require('./analytics/vendorAnalytics');
exports.getVendorDashboard = vendorAnalytics.getVendorDashboard;
exports.getVendorSales = vendorAnalytics.getVendorSales;
exports.getVendorProductPerformance = vendorAnalytics.getVendorProductPerformance;
exports.getVendorOverview = vendorAnalytics.getVendorOverview;
exports.getVendorsWithRidersNoOrders = vendorAnalytics.getVendorsWithRidersNoOrders;

// Re-export admin analytics
const adminAnalytics = require('./analytics/adminAnalytics');
exports.getAdminDashboard = adminAnalytics.getAdminDashboard;
exports.getAdminSales = adminAnalytics.getAdminSales;
exports.getAdminVendorAnalytics = adminAnalytics.getAdminVendorAnalytics;
exports.getAdminProductAnalytics = adminAnalytics.getAdminProductAnalytics;
exports.getAdminDashboardOverview = adminAnalytics.getAdminDashboardOverview;

// Re-export inventory management
const inventoryManagement = require('./analytics/inventoryManagement');
exports.updateStock = inventoryManagement.updateStock;
exports.getProductInventory = inventoryManagement.getProductInventory;
exports.getAllInventory = inventoryManagement.getAllInventory;
exports.getVendorProductsList = inventoryManagement.getVendorProductsList;

// Re-export product sales report
const productSalesReport = require('./analytics/productSalesReport');
exports.getProductSalesReport = productSalesReport.getProductSalesReport;
