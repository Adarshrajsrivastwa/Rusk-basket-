const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const { uploadToCloudinary } = require('../utils/cloudinary');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');

// Helper function to format response - keep _id for operations but ensure code is present
const formatResponse = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => formatResponse(item));
  }
  
  const cleaned = { ...obj };
  
  // Recursively format nested objects (but keep _id in nested objects too for references)
  for (const key in cleaned) {
    if (cleaned[key] && typeof cleaned[key] === 'object' && !(cleaned[key] instanceof Date)) {
      cleaned[key] = formatResponse(cleaned[key]);
    }
  }
  
  return cleaned;
};

/**
 * Create invoice (usually called automatically when order is placed)
 * Extracts all pricing information directly from order:
 * - Subtotal (calculated from vendor items)
 * - Discount, handling charge, cashback (direct from order pricing)
 * - Saves all pricing details in the invoice
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

    // Extract all pricing information directly from order
    const orderPricing = order.pricing || {};
    
    // Calculate vendor subtotal and tax from items
    // Note: item.tax is already calculated as amount (not percentage) in order
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const vendorTax = vendorItems.reduce((sum, item) => sum + (item.tax || 0), 0);
    
    // Use pricing fields directly from order (no vendor-specific percentage calculation)
    const discount = orderPricing.discount || 0;
    const handlingCharge = orderPricing.handlingCharge || 0;
    const cashback = orderPricing.totalCashback || 0;
    
    // Calculate total amount: subtotal + handlingCharge + tax - discount
    const vendorTotal = vendorSubtotal + handlingCharge + vendorTax - discount;
    
    // Set due date (30 days from invoice date)
    const invoiceDate = order.createdAt;
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Generate invoice number
    const invoiceNumber = await Invoice.generateInvoiceNumber();

    // Populate products to get SKU, HSSN, and Description
    const Product = require('../models/Product');
    const productIds = vendorItems.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } }).select('skuHsn skus description');

    // Create a map of product ID to product data
    const productMap = {};
    products.forEach(product => {
      productMap[product._id.toString()] = {
        skuHsn: product.skuHsn || '',
        skus: product.skus || [],
        description: product.description || '',
      };
    });

    // Create invoice
    const invoice = new Invoice({
      invoiceNumber,
      order: orderId,
      orderNumber: order.orderNumber,
      user: order.user._id,
      vendor: vendorId,
      date: invoiceDate,
      dueDate: dueDate,
      amount: vendorTotal,
      payment: {
        method: order.payment.method,
        status: order.payment.status,
      },
      status: order.payment.status === 'completed' ? 'paid' : 'pending',
      items: vendorItems.map(item => {
        const productData = productMap[item.product.toString()] || {};
        // Get SKU from order item if available, otherwise from product
        const sku = item.sku || (productData.skus && productData.skus.length > 0 ? productData.skus[0].sku : '');
        const hssn = productData.skuHsn || '';
        const description = productData.description || '';
        
        return {
          product: item.product,
          productName: item.productName,
          description: description,
          quantity: item.quantity,
          unitPrice: item.salePrice,
          totalPrice: item.totalPrice,
          sku: sku,
          hssn: hssn,
        };
      }),
      pricing: {
        // Subtotal: Sum of all item prices for this vendor
        subtotal: Math.round(vendorSubtotal * 100) / 100,
        // Discount: Direct from order pricing
        discount: Math.round(discount * 100) / 100,
        // Item Cost: Same as subtotal (total cost of items)
        itemCost: Math.round(vendorSubtotal * 100) / 100,
        // Tax: Sum of tax from all vendor items
        tax: Math.round(vendorTax * 100) / 100,
        // Handling Charge: Direct from order pricing
        handlingCharge: Math.round(handlingCharge * 100) / 100,
        // Total Amount: Final amount after all calculations (subtotal + handlingCharge + tax - discount)
        totalAmount: Math.round(vendorTotal * 100) / 100,
        // Total Cashback: Direct from order pricing
        totalCashback: Math.round(cashback * 100) / 100,
      },
    });

    await invoice.save();

    // Log invoice creation with pricing details
    logger.info(`Invoice created: ${invoiceNumber} for Order: ${order.orderNumber}, Vendor: ${vendorId}`);
    logger.info(`Invoice pricing extracted from order - Subtotal: ${invoice.pricing.subtotal}, Discount: ${invoice.pricing.discount}, Tax: ${invoice.pricing.tax}, Handling Charge: ${invoice.pricing.handlingCharge}, Total: ${invoice.pricing.totalAmount}, Cashback: ${invoice.pricing.totalCashback}`);

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
      .populate({
        path: 'order',
        select: 'orderNumber status items pricing',
      })
      .populate('user', 'userName contactNumber email shippingAddress')
      .populate('vendor', 'vendorName storeName contactNumber email storeAddress')
      .populate('items.product', 'productName description thumbnail skuHsn skus');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    // Format invoice data with all details - keep _id for operations, code for display
    const invoiceData = invoice.toObject ? invoice.toObject() : invoice;
    
    // Format user shipping address
    let formattedUser = invoiceData.user;
    if (formattedUser && formattedUser.shippingAddress) {
      const shippingAddr = formattedUser.shippingAddress;
      formattedUser = {
        ...formattedUser,
        shippingAddress: {
          addressLine1: shippingAddr.addressLine1 || shippingAddr.line1 || '',
          addressLine2: shippingAddr.addressLine2 || shippingAddr.line2 || '',
          city: shippingAddr.city || '',
          state: shippingAddr.state || '',
          pinCode: shippingAddr.pinCode || shippingAddr.pincode || '',
        }
      };
    }

    // Format vendor store address
    let formattedVendor = invoiceData.vendor;
    if (formattedVendor && formattedVendor.storeAddress) {
      const storeAddr = formattedVendor.storeAddress;
      formattedVendor = {
        ...formattedVendor,
        storeAddress: {
          addressLine1: storeAddr.addressLine1 || storeAddr.line1 || '',
          addressLine2: storeAddr.addressLine2 || storeAddr.line2 || '',
          city: storeAddr.city || '',
          state: storeAddr.state || '',
          pinCode: storeAddr.pinCode || storeAddr.pincode || '',
        }
      };
    }

    // Format order to include _id, items (name, quantity), and total amount
    let formattedOrder = invoiceData.order;
    if (formattedOrder) {
      // Format items to include productName and quantity
      const formattedItems = (formattedOrder.items || []).map(item => ({
        productName: item.productName || '',
        quantity: item.quantity || 0,
        totalPrice: item.totalPrice || 0,
      }));

      formattedOrder = {
        _id: formattedOrder._id || invoice.order?._id || invoice.order,
        orderNumber: formattedOrder.orderNumber || invoice.orderNumber,
        status: formattedOrder.status || '',
        items: formattedItems,
        totalAmount: formattedOrder.pricing?.total || invoice.amount || 0,
      };
    }

    const formattedInvoice = formatResponse({
      ...invoiceData,
      code: invoice.code,
      order: formattedOrder,
      user: formattedUser,
      vendor: formattedVendor,
      // Ensure pricing is included
      pricing: invoice.pricing || {
        subtotal: invoice.items.reduce((sum, item) => sum + item.totalPrice, 0),
        discount: 0,
        itemCost: invoice.items.reduce((sum, item) => sum + item.totalPrice, 0),
        tax: 0,
        handlingCharge: 0,
        totalAmount: invoice.amount,
        totalCashback: 0,
      },
      // Ensure due date is set
      dueDate: invoice.dueDate || (() => {
        const dueDate = new Date(invoice.date);
        dueDate.setDate(dueDate.getDate() + 30);
        return dueDate;
      })(),
    });

    res.status(200).json({
      success: true,
      data: formattedInvoice,
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

    // Get order details with items and pricing
    const order = await Order.findById(orderId).select('orderNumber status items pricing').lean();

    const invoices = await Invoice.find({ order: orderId })
      .populate({
        path: 'order',
        select: 'orderNumber status items pricing',
      })
      .populate('user', 'userName contactNumber email shippingAddress')
      .populate('vendor', 'vendorName storeName contactNumber email storeAddress')
      .populate('items.product', 'productName description thumbnail skuHsn skus')
      .sort({ createdAt: -1 })
      .lean();

    // Format invoices with complete details
    const formattedInvoices = invoices.map(invoice => {
      const invoiceData = invoice;

      // Format user shipping address
      let formattedUser = invoiceData.user;
      if (formattedUser && formattedUser.shippingAddress) {
        const shippingAddr = formattedUser.shippingAddress;
        formattedUser = {
          ...formattedUser,
          shippingAddress: {
            addressLine1: shippingAddr.addressLine1 || shippingAddr.line1 || '',
            addressLine2: shippingAddr.addressLine2 || shippingAddr.line2 || '',
            city: shippingAddr.city || '',
            state: shippingAddr.state || '',
            pinCode: shippingAddr.pinCode || shippingAddr.pincode || '',
          }
        };
      }

      // Format vendor store address
      let formattedVendor = invoiceData.vendor;
      if (formattedVendor && formattedVendor.storeAddress) {
        const storeAddr = formattedVendor.storeAddress;
        formattedVendor = {
          ...formattedVendor,
          storeAddress: {
            addressLine1: storeAddr.addressLine1 || storeAddr.line1 || '',
            addressLine2: storeAddr.addressLine2 || storeAddr.line2 || '',
            city: storeAddr.city || '',
            state: storeAddr.state || '',
            pinCode: storeAddr.pinCode || storeAddr.pincode || '',
          }
        };
      }

      // Format order to include _id, items (name, quantity), and total amount
      let formattedOrder = invoiceData.order || order;
      if (formattedOrder) {
        // Format items to include productName and quantity
        const formattedItems = (formattedOrder.items || []).map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 0,
          totalPrice: item.totalPrice || 0,
        }));

        formattedOrder = {
          _id: formattedOrder._id || orderId,
          orderNumber: formattedOrder.orderNumber || invoice.orderNumber,
          status: formattedOrder.status || '',
          items: formattedItems,
          totalAmount: formattedOrder.pricing?.total || invoice.amount || 0,
        };
      }

      return formatResponse({
        ...invoiceData,
        code: invoice.code,
        order: formattedOrder,
        user: formattedUser,
        vendor: formattedVendor,
        // Ensure pricing is included
        pricing: invoice.pricing || {
          subtotal: invoice.items.reduce((sum, item) => sum + item.totalPrice, 0),
          discount: 0,
          itemCost: invoice.items.reduce((sum, item) => sum + item.totalPrice, 0),
          tax: 0,
          handlingCharge: 0,
          totalAmount: invoice.amount,
          totalCashback: 0,
        },
        // Ensure due date is set
        dueDate: invoice.dueDate || (() => {
          const dueDate = new Date(invoice.date);
          dueDate.setDate(dueDate.getDate() + 30);
          return dueDate;
        })(),
      });
    });

    res.status(200).json({
      success: true,
      data: formattedInvoices,
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
      .populate('items.product', 'productName description thumbnail skuHsn skus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    // Format invoices - keep _id for operations, code for display
    const formattedInvoices = invoices.map(invoice => formatResponse({
      ...invoice,
      code: invoice.code,
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
      .populate('items.product', 'productName description thumbnail skuHsn skus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    // Format invoices - keep _id for operations, code for display
    const formattedInvoices = invoices.map(invoice => formatResponse({
      ...invoice,
      code: invoice.code,
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
      .populate('items.product', 'productName description thumbnail skuHsn skus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Invoice.countDocuments(query);

    // Format invoices with serial number for table display - keep _id for operations, code for display
    const formattedInvoices = invoices.map((invoice, index) => formatResponse({
      serialNumber: skip + index + 1,
      invoiceNumber: invoice.invoiceNumber,
      code: invoice.code,
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

    // Format response - keep _id for operations, code for display
    const invoiceData = invoice.toObject ? invoice.toObject() : invoice;
    const responseData = formatResponse({
      ...invoiceData,
      code: invoice.code,
    });

    res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
      data: responseData,
    });
  } catch (error) {
    logger.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice status',
    });
  }
};

/**
 * Update invoice data (items, pricing, etc.)
 */
exports.updateInvoice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { invoiceId } = req.params;
    const { items, pricing, dueDate } = req.body;

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found',
      });
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      invoice.items = items.map((item, index) => {
        const existingItem = item._id 
          ? invoice.items.find(i => i._id && i._id.toString() === item._id.toString())
          : invoice.items[index];
        
        return {
          product: item.product || existingItem?.product,
          productName: item.productName || existingItem?.productName,
          quantity: item.quantity !== undefined ? item.quantity : (existingItem?.quantity || 1),
          unitPrice: item.unitPrice !== undefined ? item.unitPrice : (existingItem?.unitPrice || 0),
          totalPrice: item.totalPrice !== undefined ? item.totalPrice : (existingItem?.totalPrice || 0),
          sku: item.sku !== undefined ? item.sku : (existingItem?.sku || ''),
          hssn: item.hssn !== undefined ? item.hssn : (existingItem?.hssn || ''),
        };
      });
    }

    // Update pricing if provided
    if (pricing) {
      invoice.pricing = {
        subtotal: pricing.subtotal !== undefined ? pricing.subtotal : invoice.pricing?.subtotal || invoice.pricing?.itemCost || 0,
        discount: pricing.discount !== undefined ? pricing.discount : invoice.pricing?.discount || 0,
        itemCost: pricing.itemCost !== undefined ? pricing.itemCost : invoice.pricing?.itemCost || 0,
        cgst: pricing.cgst !== undefined ? pricing.cgst : invoice.pricing?.cgst || 0,
        sgst: pricing.sgst !== undefined ? pricing.sgst : invoice.pricing?.sgst || 0,
        totalGst: pricing.totalGst !== undefined ? pricing.totalGst : invoice.pricing?.totalGst || 0,
        handlingCharge: pricing.handlingCharge !== undefined ? pricing.handlingCharge : invoice.pricing?.handlingCharge || 0,
        totalAmount: pricing.totalAmount !== undefined ? pricing.totalAmount : invoice.pricing?.totalAmount || invoice.amount,
        totalCashback: pricing.totalCashback !== undefined ? pricing.totalCashback : invoice.pricing?.totalCashback || 0,
      };
      
      // Update main amount if totalAmount changed
      if (pricing.totalAmount !== undefined) {
        invoice.amount = pricing.totalAmount;
      }
    }

    // Update due date if provided
    if (dueDate) {
      invoice.dueDate = new Date(dueDate);
    }

    await invoice.save();

    logger.info(`Invoice updated: ${invoice.invoiceNumber}`);

    const updatedInvoice = await Invoice.findById(invoiceId)
      .populate('order', 'orderNumber status')
      .populate('user', 'userName contactNumber email shippingAddress')
      .populate('vendor', 'vendorName storeName contactNumber email storeAddress')
      .populate('items.product', 'productName description thumbnail skuHsn skus')
      .lean();

    // Format response - keep _id for operations, code for display
    const responseData = formatResponse({
      ...updatedInvoice,
      code: updatedInvoice.code,
    });

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: responseData,
    });
  } catch (error) {
    logger.error('Update invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice',
    });
  }
};

/**
 * Update invoice from order payment details
 * Updates all pricing information directly from order (handling charge, tax, discount, cashback, etc.) for all invoices of an order
 * Uses pricing fields directly from order without vendor-specific percentage calculations
 */
exports.updateInvoiceFromOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderNumber } = req.params;

    // Find order by orderNumber
    const order = await Order.findOne({ orderNumber })
      .populate('items.vendor', 'vendorName');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Get all invoices for this order
    const invoices = await Invoice.find({ order: order._id });

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No invoices found for this order',
      });
    }

    const updatedInvoices = [];

    // Update each invoice with handling charge and total amount
    for (const invoice of invoices) {
      // Get vendor items from the order
      const vendorItems = order.items.filter(item => {
        const itemVendorId = item.vendor?._id ? item.vendor._id.toString() : item.vendor?.toString() || item.vendor.toString();
        return itemVendorId === invoice.vendor.toString();
      });

      if (vendorItems.length === 0) {
        continue;
      }

      // Extract all pricing information directly from order
      const orderPricing = order.pricing || {};
      
      // Calculate vendor subtotal and tax from items
      const vendorSubtotal = vendorItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const vendorTax = vendorItems.reduce((sum, item) => sum + (item.tax || 0), 0);
      
      // Use pricing fields directly from order (no vendor-specific percentage calculation)
      const discount = orderPricing.discount || 0;
      const handlingCharge = orderPricing.handlingCharge || 0;
      const cashback = orderPricing.totalCashback || 0;
      
      // Calculate total amount: subtotal + handlingCharge + tax - discount
      const vendorTotal = vendorSubtotal + handlingCharge + vendorTax - discount;

      // Update invoice pricing with all fields directly from order
      invoice.pricing = {
        // Subtotal: Sum of all item prices for this vendor
        subtotal: Math.round(vendorSubtotal * 100) / 100,
        // Discount: Direct from order pricing
        discount: Math.round(discount * 100) / 100,
        // Item Cost: Same as subtotal (total cost of items)
        itemCost: Math.round(vendorSubtotal * 100) / 100,
        // Tax: Sum of tax from all vendor items
        tax: Math.round(vendorTax * 100) / 100,
        // Handling Charge: Direct from order pricing
        handlingCharge: Math.round(handlingCharge * 100) / 100,
        // Total Amount: Final amount after all calculations (subtotal + handlingCharge + tax - discount)
        totalAmount: Math.round(vendorTotal * 100) / 100,
        // Total Cashback: Direct from order pricing
        totalCashback: Math.round(cashback * 100) / 100,
      };

      // Update main amount
      invoice.amount = vendorTotal;

      await invoice.save();

      const populatedInvoice = await Invoice.findById(invoice._id)
        .populate('order', 'orderNumber status')
        .populate('user', 'userName contactNumber email shippingAddress')
        .populate('vendor', 'vendorName storeName contactNumber email storeAddress')
        .populate('items.product', 'productName description thumbnail skuHsn skus')
        .lean();

      // Format response - keep _id for operations, code for display
      const formattedInvoice = formatResponse({
        ...populatedInvoice,
        code: populatedInvoice.code,
      });

      updatedInvoices.push(formattedInvoice);

      logger.info(`Invoice updated from order: ${invoice.invoiceNumber} for Order: ${order.orderNumber}, Vendor: ${invoice.vendor}`);
      logger.info(`Updated pricing - Subtotal: ${invoice.pricing.subtotal}, Discount: ${invoice.pricing.discount}, Tax: ${invoice.pricing.tax}, Handling Charge: ${invoice.pricing.handlingCharge}, Total: ${invoice.pricing.totalAmount}, Cashback: ${invoice.pricing.totalCashback}`);
    }

    res.status(200).json({
      success: true,
      message: `Updated ${updatedInvoices.length} invoice(s) from order payment details`,
      data: {
        orderNumber: order.orderNumber,
        orderTotal: order.pricing.total,
        orderHandlingCharge: order.pricing.handlingCharge || 0,
        invoices: updatedInvoices,
      },
    });
  } catch (error) {
    logger.error('Update invoice from order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoices from order',
    });
  }
};

/**
 * Generate invoice PDF for an order and upload to Cloudinary
 * Updates the order with the PDF URL
 */
exports.generateOrderInvoicePDF = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { orderNumber } = req.params;

    // Find order by order number with populated user and vendor
    const order = await Order.findOne({ orderNumber })
      .populate('user', 'userName contactNumber email')
      .populate('items.vendor', 'vendorName storeName contactNumber altContactNumber email storeAddress');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Get unique vendors from order items
    const vendorIds = [...new Set(order.items.map(item => {
      const vendorId = item.vendor?._id ? item.vendor._id.toString() : item.vendor?.toString();
      return vendorId;
    }))];

    if (vendorIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No vendors found in order',
      });
    }

    // For now, we'll generate one PDF for the entire order
    // If you need separate PDFs per vendor, we can modify this
    const vendorId = vendorIds[0];
    const vendor = order.items.find(item => {
      const itemVendorId = item.vendor?._id ? item.vendor._id.toString() : item.vendor?.toString();
      return itemVendorId === vendorId;
    })?.vendor;

    if (!vendor) {
      return res.status(400).json({
        success: false,
        error: 'Vendor not found',
      });
    }

    // Prepare order data for PDF generation
    const orderData = {
      ...order.toObject(),
      vendor: vendor,
      user: order.user,
    };

    // Generate PDF buffer
    logger.info(`Generating PDF invoice for order: ${orderNumber}`);
    const pdfBuffer = await generateInvoicePDF(orderData);

    // Upload PDF to Cloudinary
    const pdfFile = {
      buffer: pdfBuffer,
      originalname: `invoice-${orderNumber}.pdf`,
      mimetype: 'application/pdf',
    };

    logger.info(`Uploading PDF to Cloudinary for order: ${orderNumber}`);
    const uploadResult = await uploadToCloudinary(pdfFile, 'rush-basket/invoices');

    // Create single URL for both view and download (without /api prefix)
    const invoiceUrl = `/invoice/order/${order.orderNumber}/download-pdf`;

    // Update order with PDF URL (single URL for both view and download)
    order.invoicePdf = {
      url: invoiceUrl,
      publicId: uploadResult.publicId,
    };

    await order.save();

    logger.info(`Invoice PDF generated and saved for order: ${orderNumber} with URL: ${invoiceUrl}`);

    res.status(200).json({
      success: true,
      message: 'Invoice PDF generated and uploaded successfully',
      data: {
        orderNumber: order.orderNumber,
        invoicePdf: {
          url: invoiceUrl, // Single URL for both view and download (without /api)
          publicId: uploadResult.publicId,
        },
      },
    });
  } catch (error) {
    logger.error('Generate order invoice PDF error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice PDF',
      message: error.message,
    });
  }
};

/**
 * Download/View invoice PDF by order number
 * Fetches PDF from Cloudinary and serves it with proper headers
 */
exports.downloadInvoicePDF = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const { download } = req.query; // If download=true, force download instead of view

    // Find order by order number
    const order = await Order.findOne({ orderNumber }).select('invoicePdf orderNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (!order.invoicePdf || !order.invoicePdf.publicId) {
      return res.status(404).json({
        success: false,
        error: 'Invoice PDF not found for this order. Please generate it first.',
      });
    }

    try {
      // Build Cloudinary URL from publicId
      const cloudinaryUrl = cloudinary.url(order.invoicePdf.publicId, {
        resource_type: 'raw',
        format: 'pdf',
        secure: true,
      });

      // Fetch PDF from Cloudinary
      const response = await axios.get(cloudinaryUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout
      });

      const pdfBuffer = Buffer.from(response.data);

      // Set appropriate headers
      const filename = `invoice-${order.orderNumber}.pdf`;
      const contentType = 'application/pdf';

      if (download === 'true') {
        // Force download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        // Open in browser
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      }

      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Send PDF buffer
      res.send(pdfBuffer);
    } catch (fetchError) {
      logger.error('Error fetching PDF from Cloudinary:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice PDF from storage',
        message: fetchError.message,
      });
    }
  } catch (error) {
    logger.error('Download invoice PDF error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download invoice PDF',
      message: error.message,
    });
  }
};
