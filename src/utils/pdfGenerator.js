const PDFDocument = require('pdfkit');
const { Readable } = require('stream');
const logger = require('./logger');

// Color constants
const ORANGE = '#FF6B35';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const GREEN = '#28A745';
const LIGHT_GRAY = '#F5F5F5';

/**
 * Generate invoice PDF buffer from order data
 * @param {Object} orderData - Order data with populated user and vendor
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateInvoicePDF = async (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
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
      const payment = order.payment || {};

      // Generate invoice code and number
      const invoiceCode = `INV${String(order.orderNumber?.replace('RB', '') || Date.now()).padStart(6, '0')}`;
      const invoiceNumber = `RUSH-INV-${new Date().getFullYear()}-${String(order.orderNumber?.replace('RB', '') || Date.now()).padStart(6, '0')}`;
      const invoiceDate = order.createdAt ? new Date(order.createdAt) : new Date();
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from invoice date

      // ========== HEADER SECTION (Orange Background) ==========
      const headerHeight = 120;
      doc.rect(0, 0, 595.28, headerHeight).fill(ORANGE);
      
      // INVOICE text (large, white, bold)
      doc.fontSize(48)
         .font('Helvetica-Bold')
         .fillColor(WHITE)
         .text('INVOICE', 50, 30, { align: 'left' });

      // Invoice Code and Number (white, smaller)
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor(WHITE)
         .text(`Code: ${invoiceCode}`, 50, 85);
      
      doc.fontSize(12)
         .text(`Invoice #: ${invoiceNumber}`, 50, 100);

      // ========== KEY INFORMATION BOXES ==========
      let yPos = headerHeight + 20;
      const boxWidth = 165;
      const boxHeight = 80;
      const boxSpacing = 20;
      const startX = 50;

      // Invoice Date Box
      doc.rect(startX, yPos, boxWidth, boxHeight)
         .stroke(ORANGE)
         .fill(WHITE);
      
      // Calendar icon placeholder (using text)
      doc.fontSize(16)
         .fillColor(ORANGE)
         .text('📅', startX + 10, yPos + 12);
      
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('INVOICE DATE', startX + 35, yPos + 10);
      
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text(invoiceDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), startX + 10, yPos + 35);

      // Due Date Box
      const dueDateX = startX + boxWidth + boxSpacing;
      doc.rect(dueDateX, yPos, boxWidth, boxHeight)
         .stroke(ORANGE)
         .fill(WHITE);
      
      doc.fontSize(16)
         .fillColor(ORANGE)
         .text('📅', dueDateX + 10, yPos + 12);
      
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('DUE DATE', dueDateX + 35, yPos + 10);
      
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text(dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), dueDateX + 10, yPos + 35);

      // Order ID Box
      const orderIdX = dueDateX + boxWidth + boxSpacing;
      doc.rect(orderIdX, yPos, boxWidth, boxHeight)
         .stroke(ORANGE)
         .fill(WHITE);
      
      doc.fontSize(16)
         .fillColor(ORANGE)
         .text('📦', orderIdX + 10, yPos + 12);
      
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('ORDER ID', orderIdX + 35, yPos + 10);
      
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text(order.orderNumber || 'N/A', orderIdX + 10, yPos + 35);

      // ========== COMPANY DETAILS SECTION ==========
      yPos = yPos + boxHeight + 20;
      const companyBoxHeight = 140;
      
      doc.rect(50, yPos, 495.28, companyBoxHeight)
         .stroke(ORANGE)
         .fill(WHITE);

      // Company Details Header
      doc.fontSize(16)
         .fillColor(ORANGE)
         .text('🏢', 60, yPos + 12);
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('Company Details', 85, yPos + 12);

      // Company Name
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('Rush Delivery Services', 60, yPos + 35);

      // Contact Information with Icons
      let contactY = yPos + 60;
      const contactSpacing = 18;

      // Email
      doc.fontSize(10)
         .fillColor(ORANGE)
         .text('✉', 60, contactY);
      doc.fontSize(10)
         .fillColor(BLACK)
         .text('info@rushdelivery.com', 85, contactY);

      // Phone
      contactY += contactSpacing;
      doc.fontSize(10)
         .fillColor(ORANGE)
         .text('📞', 60, contactY);
      doc.fontSize(10)
         .fillColor(BLACK)
         .text('+91 1800 123 4567', 85, contactY);

      // Address
      contactY += contactSpacing;
      doc.fontSize(10)
         .fillColor(ORANGE)
         .text('📍', 60, contactY);
      doc.fontSize(10)
         .fillColor(BLACK)
         .text('123 Business Park, Patna, Bihar - 800001, India', 85, contactY);

      // Website
      contactY += contactSpacing;
      doc.fontSize(10)
         .fillColor(ORANGE)
         .text('🌐', 60, contactY);
      doc.fontSize(10)
         .fillColor(BLACK)
         .text('www.rushdelivery.com', 85, contactY);

      // Horizontal line separator
      doc.moveTo(60, yPos + companyBoxHeight - 5)
         .lineTo(545.28, yPos + companyBoxHeight - 5)
         .stroke(ORANGE);

      // ========== PAYMENT METHOD SECTION ==========
      yPos = yPos + companyBoxHeight + 20;
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('Payment Method:', 50, yPos);
      
      const paymentMethod = (payment.method || 'COD').toUpperCase();
      const paymentStatus = (payment.status || 'PENDING').toUpperCase();
      
      // Payment method box
      const paymentBoxY = yPos + 5;
      doc.rect(50, paymentBoxY, 200, 40)
         .stroke(ORANGE)
         .fill(WHITE);
      
      doc.fontSize(10)
         .fillColor(ORANGE)
         .text('💳', 60, paymentBoxY + 10);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text(paymentMethod, 85, paymentBoxY + 10);
      
      doc.fontSize(10)
         .fillColor(BLACK)
         .text(`Status: ${paymentStatus}`, 85, paymentBoxY + 25);

      // ========== INVOICE ITEMS SECTION ==========
      yPos = paymentBoxY + 60;
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(BLACK)
         .text('Invoice Items', 50, yPos);
      
      yPos += 25;

      // Table Header (Orange background)
      const tableHeaderY = yPos;
      const tableHeaderHeight = 30;
      doc.rect(50, tableHeaderY, 495.28, tableHeaderHeight)
         .fill(ORANGE);
      
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(WHITE)
         .text('SKU/HSSN', 60, tableHeaderY + 8);
      doc.text('Description', 150, tableHeaderY + 8);
      doc.text('Quantity', 300, tableHeaderY + 8);
      doc.text('Unit Price', 380, tableHeaderY + 8);
      doc.text('Total', 480, tableHeaderY + 8);

      // Table Rows
      yPos = tableHeaderY + tableHeaderHeight;
      doc.fillColor(BLACK);
      
      items.forEach((item, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        const rowHeight = 30;
        const bgColor = index % 2 === 0 ? WHITE : LIGHT_GRAY;
        
        doc.rect(50, yPos, 495.28, rowHeight)
           .fill(bgColor);

        const sku = item.sku || `SKU-${index + 1}`;
        const description = item.productName || 'N/A';
        const quantity = item.quantity || 0;
        const unitPrice = item.salePrice || item.unitPrice || 0;
        const total = item.totalPrice || 0;

        doc.fontSize(9)
           .font('Helvetica')
           .fillColor(BLACK)
           .text(`HSSN: ${sku}`, 60, yPos + 8);
        doc.text(description, 150, yPos + 8, { width: 140, ellipsis: true });
        doc.text(quantity.toString(), 300, yPos + 8);
        doc.text(`₹${unitPrice.toFixed(2)}`, 380, yPos + 8);
        doc.text(`₹${total.toFixed(2)}`, 480, yPos + 8);

        yPos += rowHeight;
      });

      // ========== PRICING SUMMARY SECTION ==========
      yPos += 20;
      const summaryStartY = yPos;
      const summaryWidth = 200;
      const summaryX = 350;

      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(BLACK);

      // Item Cost
      doc.text('Item Cost:', summaryX, yPos);
      doc.text(`₹${(pricing.subtotal || 0).toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });
      yPos += 20;

      // Total GST
      if (pricing.tax > 0) {
        doc.text('Total GST:', summaryX, yPos);
        doc.text(`₹${pricing.tax.toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });
        yPos += 20;
      }

      // Handling Charges
      if (pricing.handlingCharge > 0) {
        doc.text('Handling Charges:', summaryX, yPos);
        doc.text(`₹${pricing.handlingCharge.toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });
        yPos += 20;
      }

      // Cashback (Green color)
      if (pricing.totalCashback > 0) {
        doc.fillColor(GREEN);
        doc.text('Cashback:', summaryX, yPos);
        doc.text(`₹${pricing.totalCashback.toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });
        yPos += 20;
        doc.fillColor(BLACK);
      }

      // Total Amount (Orange, Bold, Larger)
      yPos += 10;
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(ORANGE)
         .text('Total Amount:', summaryX, yPos);
      doc.text(`₹${(pricing.total || 0).toFixed(2)}`, summaryX + summaryWidth, yPos, { align: 'right' });

      // ========== FOOTER ==========
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(BLACK)
         .text('Thank you for your business!', 50, 750, { align: 'center' })
         .text('This is a computer-generated invoice.', 50, 765, { align: 'center' });

      // Finalize PDF
      doc.end();
    } catch (error) {
      logger.error('PDF generation error:', error);
      reject(error);
    }
  });
};

module.exports = { generateInvoicePDF };
