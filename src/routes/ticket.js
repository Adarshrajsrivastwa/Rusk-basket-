const express = require('express');
const { body, param, query } = require('express-validator');
const { getAllTickets, updateTicketStatus, addAdminMessage } = require('../controllers/ticket');
const { protect } = require('../middleware/adminAuth');

const router = express.Router();

// Get all tickets (admin only)
router.get(
  '/',
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
    query('search')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Search term cannot exceed 200 characters'),
  ],
  getAllTickets
);

// Update ticket status (admin only)
router.patch(
  '/:ticketId/status',
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
  '/:ticketId/messages',
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

module.exports = router;
