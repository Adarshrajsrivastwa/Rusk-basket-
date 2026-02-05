const express = require('express');
const { query, body } = require('express-validator');
const router = express.Router();

// Controllers
const { getAllProductsList } = require('../controllers/productGet');
const { getAllOrders } = require('../controllers/checkout');
const { getAdminProfile, updateAdminProfile } = require('../controllers/admin');

// Middleware
const { protect } = require('../middleware/adminAuth');
const { uploadFields } = require('../middleware/upload');

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

module.exports = router;
