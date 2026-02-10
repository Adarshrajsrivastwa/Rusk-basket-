const express = require('express');
const { query, body, param } = require('express-validator');
const router = express.Router();

// Controllers
const { getAllProductsList } = require('../controllers/productGet');
const { addProduct } = require('../controllers/productAdd');
const { getAllOrders } = require('../controllers/checkout');
const { getAdminProfile, updateAdminProfile, updateFCMToken, removeFCMToken, testNotification } = require('../controllers/admin');
const { getAllTickets, getAdminTicket, updateTicketStatus, addAdminMessage } = require('../controllers/ticket');
const { getVendors, getVendor, suspendVendor, updateVendorDocuments, updateVendorRadius, updateVendorHandlingCharge, deleteVendor } = require('../controllers/vendor');
const { getRiders, getRider, approveRider, suspendRider, getPendingRiders } = require('../controllers/rider');
const { getAdminNotifications, markAdminNotificationAsRead, markAllAdminNotificationsAsRead, deleteAdminNotification, deleteAllAdminNotifications, getAdminUnreadCount } = require('../controllers/notification');

// Middleware
const { protect } = require('../middleware/adminAuth');
const { uploadFields } = require('../middleware/upload');
const { uploadMultiple } = require('../middleware/productUpload');

// Get all products list - simplified view (Admin only)
router.get(
  '/products',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    query('subCategory')
      .optional()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Approval status must be pending, approved, or rejected'),
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),
  ],
  getAllProductsList
);

// Create product (Admin only)
router.post(
  '/products',
  protect,
  uploadMultiple,
  [
    body('vendorId')
      .optional()
      .isMongoId()
      .withMessage('Vendor ID must be a valid MongoDB ObjectId'),
    body('productName')
      .trim()
      .notEmpty()
      .withMessage('Product name is required')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Product name cannot exceed 200 characters'),
    body('productType')
      .notEmpty()
      .withMessage('Product type is required')
      .bail()
      .isIn(['quantity', 'weight', 'volume'])
      .withMessage('Product type must be quantity, weight, or volume'),
    body('productTypeValue')
      .notEmpty()
      .withMessage('Product type value is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Product type value must be a number greater than or equal to 0'),
    body('productTypeUnit')
      .trim()
      .notEmpty()
      .withMessage('Product type unit is required'),
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .bail()
      .isMongoId()
      .withMessage('Category must be a valid MongoDB ObjectId'),
    body('subCategory')
      .notEmpty()
      .withMessage('SubCategory is required')
      .bail()
      .isMongoId()
      .withMessage('SubCategory must be a valid MongoDB ObjectId'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Description cannot exceed 5000 characters'),
    body('skuHsn')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('SKU/HSN code cannot exceed 50 characters'),
    body('inventory')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Inventory must be a number greater than or equal to 0'),
    body('actualPrice')
      .notEmpty()
      .withMessage('Actual price is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Actual price must be a number greater than or equal to 0'),
    body('regularPrice')
      .notEmpty()
      .withMessage('Regular price is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Regular price must be a number greater than or equal to 0'),
    body('salePrice')
      .notEmpty()
      .withMessage('Sale price is required')
      .bail()
      .isFloat({ min: 0 })
      .withMessage('Sale price must be a number greater than or equal to 0'),
    body('cashback')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Cashback must be a number greater than or equal to 0'),
    body('tax')
      .notEmpty()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Tax must be a percentage between 0 and 100'),
    body('tags')
      .optional()
      .trim()
      .custom((value) => {
        if (typeof value === 'string') {
          const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          if (tags.length > 20) {
            throw new Error('Maximum 20 tags allowed');
          }
        }
        return true;
      }),
  ],
  addProduct
);

// Get all orders (Admin only)
router.get(
  '/orders',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'])
      .withMessage('Invalid order status'),
    query('user')
      .optional()
      .isMongoId()
      .withMessage('User must be a valid MongoDB ObjectId'),
    query('vendor')
      .optional()
      .isMongoId()
      .withMessage('Vendor must be a valid MongoDB ObjectId'),
    query('paymentStatus')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'refunded'])
      .withMessage('Invalid payment status'),
    query('paymentMethod')
      .optional()
      .isIn(['cod', 'prepaid', 'wallet', 'upi', 'card'])
      .withMessage('Invalid payment method'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
  ],
  getAllOrders
);

// Admin Profile Routes
// Get admin profile (protected - admin can get their own profile)
router.get('/profile', protect, getAdminProfile);

// Update admin profile (protected - admin can update their own profile)
router.put(
  '/profile',
  protect,
  uploadFields,
  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Name cannot be empty'),
    body('companyName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Company name cannot be empty'),
    body('legalName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Legal name cannot be empty'),
    body('website')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^https?:\/\/.+/.test(value)) {
          throw new Error('Please provide a valid website URL');
        }
        return true;
      }),
    body('alternatePhone')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^[0-9]{10}$/.test(value)) {
          throw new Error('Please provide a valid 10-digit phone number');
        }
        return true;
      }),
    body('contactPerson')
      .optional()
      .trim(),
    body('designation')
      .optional()
      .trim(),
    body('bankName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Bank name cannot be empty'),
    body('branchName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Branch name cannot be empty'),
    body('accountNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Account number cannot be empty'),
    body('ifscCode')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)) {
          throw new Error('Please provide a valid IFSC code');
        }
        return true;
      }),
    body('foundedYear')
      .optional()
      .isInt({ min: 1800, max: new Date().getFullYear() })
      .withMessage('Founded year must be between 1800 and current year'),
    body('registrationNumber')
      .optional()
      .trim(),
    body('gstNumber')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
          throw new Error('Please provide a valid GST number');
        }
        return true;
      }),
    body('panNumber')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value)) {
          throw new Error('Please provide a valid PAN number');
        }
        return true;
      }),
    body('vision')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Vision cannot be updated through this endpoint');
        }
        return true;
      }),
    body('mission')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Mission cannot be updated through this endpoint');
        }
        return true;
      }),
    body('streetAddress')
      .optional()
      .trim(),
    body('city')
      .optional()
      .trim(),
    body('state')
      .optional()
      .trim(),
    body('pincode')
      .optional()
      .trim()
      .custom((value) => {
        if (value && value.length > 0 && !/^[0-9]{6}$/.test(value)) {
          throw new Error('Please provide a valid 6-digit pincode');
        }
        return true;
      }),
    body('country')
      .optional()
      .trim(),
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('emailVerified')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Verification status cannot be updated through this endpoint');
        }
        return true;
      }),
    body('phoneVerified')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Verification status cannot be updated through this endpoint');
        }
        return true;
      }),
    body('yearsInBusiness')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Years in business must be a non-negative integer'),
    body('totalEmployees')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Total employees must be a non-negative integer'),
    body('activeClients')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Active clients must be a non-negative integer'),
    body('totalLeads')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Total leads must be a non-negative integer'),
    body('mobile')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Mobile number cannot be updated through this endpoint');
        }
        return true;
      }),
    body('email')
      .custom((value) => {
        if (value !== undefined) {
          throw new Error('Email cannot be updated through this endpoint');
        }
        return true;
      }),
  ],
  updateAdminProfile
);

// ============ TICKET ROUTES (Admin only) ============

// Get all tickets (admin only)
router.get(
  '/tickets',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['active', 'pending', 'resolved', 'closed'])
      .withMessage('Invalid status. Must be one of: active, pending, resolved, closed'),
    query('category')
      .optional()
      .isIn(['order_delivery', 'account_profile', 'payments_refunds', 'login_otp', 'general_queries'])
      .withMessage('Invalid category. Must be one of: order_delivery, account_profile, payments_refunds, login_otp, general_queries'),
    query('createdByModel')
      .optional()
      .isIn(['User', 'Vendor', 'Rider'])
      .withMessage('Invalid createdByModel. Must be one of: User, Vendor, Rider'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Search term cannot exceed 200 characters'),
  ],
  getAllTickets
);

// Get single ticket (admin only)
router.get(
  '/tickets/:ticketId',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
  ],
  getAdminTicket
);

// Update ticket status (admin only)
router.patch(
  '/tickets/:ticketId/status',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .isIn(['active', 'pending', 'resolved', 'closed'])
      .withMessage('Status must be one of: active, pending, resolved, closed'),
    body('adminResponse')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Admin response cannot be more than 2000 characters'),
  ],
  updateTicketStatus
);

// Add admin message to ticket
router.post(
  '/tickets/:ticketId/messages',
  protect,
  [
    param('ticketId')
      .notEmpty()
      .withMessage('Ticket ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid ticket ID format'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
  ],
  addAdminMessage
);

// ============ VENDOR MANAGEMENT ROUTES (Admin only) ============

// Get all vendors (admin only)
router.get(
  '/vendors',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getVendors
);

// Get single vendor (admin only)
router.get(
  '/vendors/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
  ],
  getVendor
);

// Suspend/Activate vendor (admin only)
router.put(
  '/vendors/:id/suspend',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
  ],
  suspendVendor
);

// Update vendor documents (admin only)
router.put(
  '/vendors/:id/documents',
  protect,
  uploadFields,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
  ],
  updateVendorDocuments
);

// Update vendor service radius (admin only)
router.put(
  '/vendors/:id/radius',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
    body('serviceRadius')
      .notEmpty()
      .withMessage('Service radius is required')
      .isFloat({ min: 0 })
      .withMessage('Service radius must be a positive number'),
  ],
  updateVendorRadius
);

// Update vendor handling charge (admin only)
router.put(
  '/vendors/:id/handling-charge',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
    body('handlingChargePercentage')
      .notEmpty()
      .withMessage('Handling charge percentage is required')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Handling charge percentage must be between 0 and 100'),
  ],
  updateVendorHandlingCharge
);

// Delete vendor (admin only)
router.delete(
  '/vendors/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Vendor ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid vendor ID format'),
  ],
  deleteVendor
);

// ============ RIDER MANAGEMENT ROUTES (Admin only) ============

// Get all riders (admin only)
router.get(
  '/riders',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('approvalStatus')
      .optional()
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Invalid approval status'),
    query('isActive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isActive must be either "true" or "false"'),
  ],
  getRiders
);

// Get pending riders (admin only)
router.get(
  '/riders/pending',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  getPendingRiders
);

// Get single rider (admin only)
router.get(
  '/riders/:id',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
  ],
  getRider
);

// Approve rider (admin only)
router.put(
  '/riders/:id/approve',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
  ],
  approveRider
);

// Reject rider (admin only)
router.put(
  '/riders/:id/reject',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
    body('rejectionReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot be more than 500 characters'),
  ],
  approveRider
);

// Suspend/Activate rider (admin only)
router.put(
  '/riders/:id/suspend',
  protect,
  [
    param('id')
      .notEmpty()
      .withMessage('Rider ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid rider ID format'),
  ],
  suspendRider
);

// ============ ADMIN NOTIFICATION ROUTES ============

// Get admin notifications
router.get(
  '/notifications',
  protect,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('isRead')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isRead must be true or false'),
    query('type')
      .optional()
      .isIn(['order_created', 'order_updated', 'order_cancelled', 'order_delivered', 'product_approved', 'product_rejected', 'invoice_generated', 'payment_received', 'ticket_created', 'general'])
      .withMessage('Invalid notification type'),
  ],
  getAdminNotifications
);

// Get admin unread notification count
router.get('/notifications/unread-count', protect, getAdminUnreadCount);

// Mark admin notification as read
router.patch(
  '/notifications/:notificationId/read',
  protect,
  [
    param('notificationId')
      .notEmpty()
      .withMessage('Notification ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid notification ID format'),
  ],
  markAdminNotificationAsRead
);

// Mark all admin notifications as read
router.patch('/notifications/read-all', protect, markAllAdminNotificationsAsRead);

// Delete admin notification
router.delete(
  '/notifications/:notificationId',
  protect,
  [
    param('notificationId')
      .notEmpty()
      .withMessage('Notification ID is required')
      .bail()
      .isMongoId()
      .withMessage('Invalid notification ID format'),
  ],
  deleteAdminNotification
);

// Delete all admin notifications
router.delete('/notifications', protect, deleteAllAdminNotifications);

// ============ ADMIN FCM TOKEN ROUTES ============

// Update FCM token
router.post(
  '/fcm-token',
  protect,
  [
    body('token')
      .notEmpty()
      .withMessage('FCM token is required')
      .trim(),
    body('deviceId')
      .optional()
      .trim(),
    body('platform')
      .optional()
      .isIn(['android', 'ios', 'web'])
      .withMessage('Platform must be android, ios, or web'),
  ],
  updateFCMToken
);

// Remove FCM token
router.post(
  '/fcm-token/remove',
  protect,
  [
    body('token')
      .notEmpty()
      .withMessage('FCM token is required')
      .trim(),
  ],
  removeFCMToken
);

// Test push notification
router.post('/test-notification', protect, testNotification);

module.exports = router;
