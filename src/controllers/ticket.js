const Ticket = require('../models/Ticket');
const { validationResult } = require('express-validator');
const { executeQuery } = require('../utils/queryManager');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Admin = require('../models/Admin');

// Helper function to populate messages with sender info
const populateMessages = async (messages) => {
  if (!messages || messages.length === 0) return;

  // Collect all sender IDs by type
  const senderIds = {
    users: [],
    vendors: [],
    admins: []
  };

  messages.forEach(msg => {
    if (msg.sender && msg.senderModel) {
      const senderId = msg.sender.toString ? msg.sender.toString() : msg.sender;
      if (msg.senderModel === 'User') {
        senderIds.users.push(senderId);
      } else if (msg.senderModel === 'Vendor') {
        senderIds.vendors.push(senderId);
      } else if (msg.senderModel === 'Admin') {
        senderIds.admins.push(senderId);
      }
    }
  });

  // Fetch all senders in parallel
  const [users, vendors, admins] = await Promise.all([
    senderIds.users.length > 0 ? User.find({ _id: { $in: senderIds.users } }).select('userName contactNumber email').lean() : [],
    senderIds.vendors.length > 0 ? Vendor.find({ _id: { $in: senderIds.vendors } }).select('vendorName storeName contactNumber email').lean() : [],
    senderIds.admins.length > 0 ? Admin.find({ _id: { $in: senderIds.admins } }).select('name email').lean() : []
  ]);

  // Create maps for quick lookup
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));
  const adminMap = new Map(admins.map(a => [a._id.toString(), a]));

  // Assign sender data to messages
  messages.forEach(msg => {
    if (msg.sender && msg.senderModel) {
      const senderId = msg.sender.toString ? msg.sender.toString() : msg.sender;
      if (msg.senderModel === 'User' && userMap.has(senderId)) {
        msg.sender = userMap.get(senderId);
      } else if (msg.senderModel === 'Vendor' && vendorMap.has(senderId)) {
        msg.sender = vendorMap.get(senderId);
      } else if (msg.senderModel === 'Admin' && adminMap.has(senderId)) {
        msg.sender = adminMap.get(senderId);
      }
    }
  });
};

// Create a new ticket
exports.createTicket = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { category, complaint, orderId } = req.body;
    const userId = req.user._id;

    // Generate unique ticket number
    let ticketNumber;
    try {
      ticketNumber = await Ticket.generateTicketNumber();
      if (!ticketNumber) {
        throw new Error('Failed to generate ticket number');
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate ticket number. Please try again.',
        message: error.message,
      });
    }

    // Create ticket with creator info
    const ticket = await Ticket.create({
      ticketNumber,
      user: userId,
      createdBy: userId,
      createdByModel: 'User',
      category: category || 'general_queries',
      complaint,
      status: 'active',
      orderId: orderId || null,
      messages: [{
        sender: userId,
        senderModel: 'User',
        message: complaint,
        createdAt: new Date(),
      }],
    });

    // Populate messages with sender info
    await populateMessages(ticket.messages);

    // Populate other fields
    await ticket.populate('createdBy', 'userName contactNumber email');
    await ticket.populate('orderId', 'orderNumber totalAmount status');

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create ticket',
      message: error.message,
    });
  }
};

// Get all tickets for the logged-in user
exports.getTickets = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const { page = 1, limit = 10, status, category } = req.query;

    // Build filters
    const filters = { user: userId };
    if (status) {
      filters.status = status;
    }
    if (category) {
      filters.category = category;
    }

    // Execute query with pagination
    const result = await executeQuery(Ticket, {
      filters,
      sort: { createdAt: -1 },
      pagination: { page: parseInt(page), limit: parseInt(limit) },
      populate: [
        { path: 'orderId', select: 'orderNumber totalAmount status' },
        { path: 'createdBy', select: 'userName contactNumber email vendorName storeName' },
      ],
    });

    // Manually populate messages with sender info for each ticket
    if (result.data && result.data.length > 0) {
      for (let ticket of result.data) {
        if (ticket.messages && ticket.messages.length > 0) {
          await populateMessages(ticket.messages);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Tickets fetched successfully',
      data: {
        tickets: result.data,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets',
      message: error.message,
    });
  }
};

// Get a single ticket by ID
exports.getTicket = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: userId,
    })
      .populate('orderId', 'orderNumber totalAmount status createdAt')
      .populate('createdBy', 'userName contactNumber email vendorName storeName');

    // Manually populate messages with sender info
    if (ticket && ticket.messages && ticket.messages.length > 0) {
      await populateMessages(ticket.messages);
    }

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Ticket fetched successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket',
      message: error.message,
    });
  }
};

// Update ticket (for user - can update complaint, category, orderId)
exports.updateTicket = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const { complaint, category, orderId } = req.body;
    const userId = req.user._id;

    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: userId,
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
      });
    }

    // Check if ticket can be updated (only active or pending tickets can be updated)
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update resolved or closed tickets',
      });
    }

    // Update fields if provided
    if (complaint !== undefined) {
      ticket.complaint = complaint;
    }
    if (category !== undefined) {
      ticket.category = category;
    }
    if (orderId !== undefined) {
      ticket.orderId = orderId || null;
    }

    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update ticket',
      message: error.message,
    });
  }
};

// Add message to ticket (for user/vendor)
exports.addTicketMessage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    const ticket = await Ticket.findOne({
      _id: ticketId,
      user: userId,
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
      });
    }

    // Check if ticket can receive messages (not closed)
    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot add messages to closed tickets',
      });
    }

    // Add message
    ticket.messages.push({
      sender: userId,
      senderModel: 'User',
      message,
      createdAt: new Date(),
    });

    await ticket.save();

    // Manually populate messages with sender info
    const User = require('../models/User');
    const Vendor = require('../models/Vendor');
    const Admin = require('../models/Admin');

    // Fetch all sender IDs first
    const senderIds = {
      users: [],
      vendors: [],
      admins: []
    };

    ticket.messages.forEach(msg => {
      if (msg.senderModel === 'User' && msg.sender) {
        senderIds.users.push(msg.sender);
      } else if (msg.senderModel === 'Vendor' && msg.sender) {
        senderIds.vendors.push(msg.sender);
      } else if (msg.senderModel === 'Admin' && msg.sender) {
        senderIds.admins.push(msg.sender);
      }
    });

    // Fetch all senders in parallel
    const [users, vendors, admins] = await Promise.all([
      senderIds.users.length > 0 ? User.find({ _id: { $in: senderIds.users } }).select('userName contactNumber email').lean() : [],
      senderIds.vendors.length > 0 ? Vendor.find({ _id: { $in: senderIds.vendors } }).select('vendorName storeName contactNumber email').lean() : [],
      senderIds.admins.length > 0 ? Admin.find({ _id: { $in: senderIds.admins } }).select('name email').lean() : []
    ]);

    // Create maps for quick lookup
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));
    const adminMap = new Map(admins.map(a => [a._id.toString(), a]));

    // Assign sender data to messages
    ticket.messages.forEach(msg => {
      const senderId = msg.sender?.toString();
      if (msg.senderModel === 'User' && senderId && userMap.has(senderId)) {
        msg.sender = userMap.get(senderId);
      } else if (msg.senderModel === 'Vendor' && senderId && vendorMap.has(senderId)) {
        msg.sender = vendorMap.get(senderId);
      } else if (msg.senderModel === 'Admin' && senderId && adminMap.has(senderId)) {
        msg.sender = adminMap.get(senderId);
      }
    });

    // Also populate other fields
    await ticket.populate('createdBy', 'userName contactNumber email vendorName storeName');
    await ticket.populate('orderId', 'orderNumber totalAmount status');

    res.status(200).json({
      success: true,
      message: 'Message added successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to add message',
      message: error.message,
    });
  }
};

// Update ticket status (admin only)
exports.updateTicketStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const { status, adminResponse } = req.body;
    const adminId = req.admin._id;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
      });
    }

    // Validate status
    const validStatuses = ['active', 'pending', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Update status
    const oldStatus = ticket.status;
    ticket.status = status;
    ticket.statusChangedBy = adminId;

    // If resolving, set resolvedBy and resolvedAt
    if (status === 'resolved') {
      ticket.resolvedBy = adminId;
      ticket.resolvedAt = new Date();
      if (adminResponse) {
        ticket.adminResponse = adminResponse;
      }
    }

    await ticket.save();

    // Populate messages with sender info
    await populateMessages(ticket.messages);

    // Also populate other fields
    await ticket.populate('createdBy', 'userName contactNumber email vendorName storeName');
    await ticket.populate('user', 'userName contactNumber email');
    await ticket.populate('orderId', 'orderNumber totalAmount status');

    res.status(200).json({
      success: true,
      message: 'Ticket status updated successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update ticket status',
      message: error.message,
    });
  }
};

// Add admin message to ticket
exports.addAdminMessage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { ticketId } = req.params;
    const { message } = req.body;
    const adminId = req.admin._id;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found',
      });
    }

    // Check if ticket can receive messages (not closed)
    if (ticket.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot add messages to closed tickets',
      });
    }

    // Add admin message
    ticket.messages.push({
      sender: adminId,
      senderModel: 'Admin',
      message,
      createdAt: new Date(),
    });

    await ticket.save();

    // Populate messages with sender info
    await populateMessages(ticket.messages);

    // Also populate other fields
    await ticket.populate('createdBy', 'userName contactNumber email vendorName storeName');
    await ticket.populate('user', 'userName contactNumber email');
    await ticket.populate('orderId', 'orderNumber totalAmount status');

    res.status(200).json({
      success: true,
      message: 'Message added successfully',
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to add message',
      message: error.message,
    });
  }
};

// Get all tickets (admin only)
exports.getAllTickets = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { page = 1, limit = 10, status, category, search } = req.query;

    // Build filters - only show tickets created by Users
    const filters = {
      createdByModel: 'User'
    };
    if (status) {
      filters.status = status;
    }
    if (category) {
      filters.category = category;
    }
    if (search) {
      filters.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { complaint: { $regex: search, $options: 'i' } },
      ];
    }

    // Execute query with pagination
    const result = await executeQuery(Ticket, {
      filters,
      sort: { createdAt: -1 },
      pagination: { page: parseInt(page), limit: parseInt(limit) },
      populate: [
        { path: 'user', select: 'userName contactNumber email' },
        { path: 'orderId', select: 'orderNumber totalAmount status' },
        { path: 'createdBy', select: 'userName contactNumber email vendorName storeName' },
        { path: 'resolvedBy', select: 'name email' },
        { path: 'statusChangedBy', select: 'name email' },
      ],
    });

    // Populate messages with sender info for each ticket
    if (result.data && result.data.length > 0) {
      for (let ticket of result.data) {
        if (ticket.messages && ticket.messages.length > 0) {
          await populateMessages(ticket.messages);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Tickets fetched successfully',
      data: {
        tickets: result.data,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets',
      message: error.message,
    });
  }
};
