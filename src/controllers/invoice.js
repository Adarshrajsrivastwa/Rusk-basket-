const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

/**
 * Create invoice (usually called automatically when order is placed)
 */
exports.createInvoice = async (orderId, vendorId) => {
  try {
    const order = await Order.findById(orderId)
      .populate('user', 'userName')
      .populate('items.vendor', 'vendorName');

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if invoice already exists for this order and vendor
    const existingInvoice = await Invoice.findOne({
      order: orderId,
      vendor: vendorId,
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    // Get vendor items from the order
    const vendorItems = order.items.filter(item => {
      const itemVendorId = item.vendor?._id ? item.vendor._id.toString() : item.vendor?.toString() || item.vendor.toString();
      return itemVendorId === vendorId.toString();
    });

    if (vendorItems.length === 0) {
      throw new Error('No items found for this vendor in the order');
    }

    // Calculate total amount for this vendor
    const vendorTotal = vendorItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    // Generate invoice number
    const invoiceNumber = await Invoice.generateInvoiceNumber();

    // Create invoice
    const invoice = new Invoice({
      invoiceNumber,
      order: orderId,
      orderNumber: order.orderNumber,
      user: order.user._id,
      vendor: vendorId,
      date: order.createdAt,
      amount: vendorTotal,
      payment: {
        method: order.payment.method,
        status: order.payment.status,
      },
      status: order.payment.status === 'completed' ? 'paid' : 'pending',
      items: vendorItems.map(item => ({
        product: item.product,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.salePrice,
        totalPrice: item.totalPrice,
      })),
    });

    await invoice.save();

    logger.info(`Invoice created: ${invoiceNumber} for Order: ${order.orderNumber}`);

    return invoice;
  } catch (error) {
    logger.error('Create invoice error:', error);
    throw error;
  }
};

/**
 * Get invoice by ID
 */
exports.getInvoiceById = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId)
      .populate('order', 'orderNumber status')
      .populate('user', 'userName contactNumber email')
      .populate('vendor', 'vendorName storeName contactNumber email')
      .populate('items.product', 'productName thumbnail');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Get invoice by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice',
    });
  }
};

/**
 * Get invoices by order ID
 */
exports.getInvoicesByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const invoices = await Invoice.find({ order: orderId })
      .populate('vendor', 'vendorName storeName')
      .populate('user', 'userName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    logger.error('Get invoices by order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices',
    });
  }
};

/**
 * Get invoices by user (for users to see their invoices)
 */
exports.getUserInvoices = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const invoices = await Invoice.find(query)
      .populate('order', 'orderNumber status')
      .populate('vendor', 'vendorName storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get user invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices',
    });
  }
};

/**
 * Get invoices by vendor (for vendors to see their invoices)
 */
exports.getVendorInvoices = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const vendorId = req.vendor._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const query = { vendor: vendorId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const invoices = await Invoice.find(query)
      .populate('order', 'orderNumber status')
      .populate('user', 'userName contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get vendor invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices',
    });
  }
};

/**
 * Get all invoices (admin only)
 */
exports.getAllInvoices = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const vendorId = req.query.vendorId;
    const userId = req.query.userId;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (vendorId) {
      query.vendor = vendorId;
    }
    if (userId) {
      query.user = userId;
    }

    const skip = (page - 1) * limit;

    const invoices = await Invoice.find(query)
      .populate('order', 'orderNumber status')
      .populate('user', 'userName contactNumber')
      .populate('vendor', 'vendorName storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    // Format invoices with serial number for table display
    const formattedInvoices = invoices.map((invoice, index) => ({
      serialNumber: skip + index + 1,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      orderId: invoice.orderNumber,
      order: invoice.order,
      vendor: invoice.vendor,
      userName: invoice.user?.userName || 'N/A',
      user: invoice.user,
      amount: invoice.amount,
      payment: invoice.payment,
      status: invoice.status,
      _id: invoice._id,
      createdAt: invoice.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        invoices: formattedInvoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get all invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices',
    });
  }
};

/**
 * Update invoice status (when payment is completed)
 */
exports.updateInvoiceStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { invoiceId } = req.params;
    const { status } = req.body;

    if (!['pending', 'paid', 'cancelled', 'refunded'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: pending, paid, cancelled, refunded',
      });
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    invoice.status = status;
    if (status === 'paid') {
      invoice.payment.status = 'completed';
    }
    await invoice.save();

    logger.info(`Invoice status updated: ${invoice.invoiceNumber} to ${status}`);

    res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
      data: invoice,
    });
  } catch (error) {
    logger.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice status',
    });
  }
};
