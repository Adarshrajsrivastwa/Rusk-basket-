const PDFDocument = require('pdfkit');
const { Readable } = require('stream');
const logger = require('./logger');

/**
 * Generate invoice PDF buffer from order data
 * @param {Object} orderData - Order data with populated user and vendor
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateInvoicePDF = async (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      // Collect PDF data
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Extract data
      const order = orderData;
      const user = order.user || {};
      const vendor = order.vendor || {};
      const items = order.items || [];
      const pricing = order.pricing || {};
      const shippingAddress = order.shippingAddress || {};
      const payment = order.payment || {};

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(`Order Number: ${order.orderNumber || 'N/A'}`, { align: 'center' });
      doc.fontSize(10).text(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : 'N/A'}`, { align: 'center' });
      doc.moveDown(1);

      // Company/Vendor Information
      doc.fontSize(14).font('Helvetica-Bold').text('Vendor Details:', 50, doc.y);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Name: ${vendor.vendorName || vendor.storeName || 'N/A'}`);
      if (vendor.storeName && vendor.vendorName !== vendor.storeName) {
        doc.text(`Store: ${vendor.storeName}`);
      }
      if (vendor.contactNumber) {
        doc.text(`Mobile: ${vendor.contactNumber}`);
      }
      if (vendor.altContactNumber) {
        doc.text(`Alt Mobile: ${vendor.altContactNumber}`);
      }
      if (vendor.email) {
        doc.text(`Email: ${vendor.email}`);
      }
      if (vendor.storeAddress) {
        const addr = vendor.storeAddress;
        doc.text(`Address: ${addr.line1 || ''}${addr.line2 ? ', ' + addr.line2 : ''}`);
        if (addr.city || addr.state || addr.pinCode) {
          doc.text(`${addr.city || ''}${addr.state ? ', ' + addr.state : ''}${addr.pinCode ? ' - ' + addr.pinCode : ''}`);
        }
      }
      doc.moveDown(1);

      // Customer/User Information
      doc.fontSize(14).font('Helvetica-Bold').text('Customer Details:', 50, doc.y);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Name: ${user.userName || 'N/A'}`);
      if (user.contactNumber) {
        doc.text(`Mobile: ${user.contactNumber}`);
      }
      if (user.email) {
        doc.text(`Email: ${user.email}`);
      }
      if (shippingAddress.line1) {
        doc.text(`Shipping Address: ${shippingAddress.line1}${shippingAddress.line2 ? ', ' + shippingAddress.line2 : ''}`);
        if (shippingAddress.city || shippingAddress.state || shippingAddress.pinCode) {
          doc.text(`${shippingAddress.city || ''}${shippingAddress.state ? ', ' + shippingAddress.state : ''}${shippingAddress.pinCode ? ' - ' + shippingAddress.pinCode : ''}`);
        }
        if (shippingAddress.phone) {
          doc.text(`Phone: ${shippingAddress.phone}`);
        }
      }
      doc.moveDown(1);

      // Items Table Header
      const tableTop = doc.y;
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Item', 50, tableTop);
      doc.text('Quantity', 200, tableTop);
      doc.text('Unit Price', 280, tableTop);
      doc.text('Total', 360, tableTop);
      
      // Draw line under header
      doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
      doc.moveDown(0.5);

      // Items
      doc.fontSize(10).font('Helvetica');
      let yPosition = doc.y;
      items.forEach((item, index) => {
        if (yPosition > 700) {
          // New page if needed
          doc.addPage();
          yPosition = 50;
        }
        
        const productName = item.productName || 'N/A';
        const quantity = item.quantity || 0;
        const unitPrice = item.salePrice || item.unitPrice || 0;
        const totalPrice = item.totalPrice || 0;

        // Wrap product name if too long
        const maxWidth = 140;
        doc.text(productName, 50, yPosition, { width: maxWidth, ellipsis: true });
        doc.text(quantity.toString(), 200, yPosition);
        doc.text(`₹${unitPrice.toFixed(2)}`, 280, yPosition);
        doc.text(`₹${totalPrice.toFixed(2)}`, 360, yPosition);
        
        yPosition += 20;
        doc.y = yPosition;
      });

      doc.moveDown(1);
      
      // Draw line before pricing
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Pricing Summary
      doc.fontSize(10).font('Helvetica');
      const pricingY = doc.y;
      doc.text('Subtotal:', 360, pricingY);
      doc.text(`₹${(pricing.subtotal || 0).toFixed(2)}`, 480, pricingY, { align: 'right' });
      
      if (pricing.discount > 0) {
        doc.moveDown(0.3);
        doc.text('Discount:', 360, doc.y);
        doc.text(`-₹${pricing.discount.toFixed(2)}`, 480, doc.y, { align: 'right' });
      }
      
      if (pricing.tax > 0) {
        doc.moveDown(0.3);
        doc.text('Tax:', 360, doc.y);
        doc.text(`₹${pricing.tax.toFixed(2)}`, 480, doc.y, { align: 'right' });
      }
      
      if (pricing.handlingCharge > 0) {
        doc.moveDown(0.3);
        doc.text('Handling Charge:', 360, doc.y);
        doc.text(`₹${pricing.handlingCharge.toFixed(2)}`, 480, doc.y, { align: 'right' });
      }
      
      if (pricing.deliveryAmount > 0) {
        doc.moveDown(0.3);
        doc.text('Delivery Charge:', 360, doc.y);
        doc.text(`₹${pricing.deliveryAmount.toFixed(2)}`, 480, doc.y, { align: 'right' });
      }
      
      doc.moveDown(0.5);
      doc.moveTo(360, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Total Amount:', 360, doc.y);
      doc.text(`₹${(pricing.total || 0).toFixed(2)}`, 480, doc.y, { align: 'right' });
      
      if (pricing.totalCashback > 0) {
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Cashback Earned: ₹${pricing.totalCashback.toFixed(2)}`, 360, doc.y);
      }

      doc.moveDown(1.5);

      // Payment Information
      doc.fontSize(12).font('Helvetica-Bold').text('Payment Information:', 50, doc.y);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Payment Method: ${(payment.method || 'N/A').toUpperCase()}`);
      doc.text(`Payment Status: ${(payment.status || 'N/A').toUpperCase()}`);
      if (payment.transactionId) {
        doc.text(`Transaction ID: ${payment.transactionId}`);
      }
      if (payment.paidAt) {
        doc.text(`Paid At: ${new Date(payment.paidAt).toLocaleString('en-IN')}`);
      }

      doc.moveDown(1);

      // Footer
      doc.fontSize(8).font('Helvetica').text('Thank you for your business!', { align: 'center' });
      doc.text('This is a computer-generated invoice.', { align: 'center' });

      // Finalize PDF
      doc.end();
    } catch (error) {
      logger.error('PDF generation error:', error);
      reject(error);
    }
  });
};

module.exports = { generateInvoicePDF };
