const PDFDocument = require('pdfkit');
const logger = require('./logger');

const ORANGE = '#FF6B35';
const ORANGE_DARK = '#E85A24';
const WHITE = '#FFFFFF';
const BLACK = '#1A1A1A';
const GRAY = '#6B7280';
const LIGHT_GRAY = '#F9FAFB';
const BORDER = '#E5E7EB';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const formatMoney = (amount) => `Rs. ${(Number(amount) || 0).toFixed(2)}`;

const formatDate = (dateInput) => {
  if (!dateInput) return 'N/A';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatAddress = (address) => {
  if (!address || typeof address !== 'object') return 'N/A';
  return [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.pinCode,
  ]
    .filter(Boolean)
    .join(', ') || 'N/A';
};

const measureTextHeight = (doc, text, width, font = 'Helvetica', size = 10) => {
  doc.font(font).fontSize(size);
  return doc.heightOfString(String(text || 'N/A'), { width });
};

const drawPanel = (doc, x, y, width, height) => {
  doc.save();
  doc.lineWidth(1).fillColor(WHITE).strokeColor(BORDER);
  doc.rect(x, y, width, height).fillAndStroke();
  doc.rect(x, y, 5, height).fill(ORANGE);
  doc.restore();
};

const drawPanelTitle = (doc, title, x, y, width) => {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(title, x, y, { width: width - 10 });
  doc.moveTo(x, y + 16).lineTo(x + width - 10, y + 16).strokeColor(ORANGE).lineWidth(0.8).stroke();
  return y + 24;
};

const drawKeyValueLines = (doc, lines, x, y, width) => {
  let cursorY = y;
  lines.forEach(({ label, value, boldValue }) => {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(label, x, cursorY, { width: 72 });
    doc
      .font(boldValue ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor(BLACK)
      .text(value || 'N/A', x + 72, cursorY, { width: width - 82 });
    cursorY += Math.max(14, measureTextHeight(doc, value, width - 82, boldValue ? 'Helvetica-Bold' : 'Helvetica', 9) + 4);
  });
  return cursorY;
};

const drawSummaryRow = (doc, label, value, x, y, width, options = {}) => {
  const { bold = false, color = BLACK } = options;
  doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(label, x, y);
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(bold ? 12 : 10)
    .fillColor(color)
    .text(value, x, y, { width, align: 'right' });
};

const ensureSpace = (doc, yPos, needed, state) => {
  if (yPos + needed <= PAGE_HEIGHT - MARGIN) return yPos;
  doc.addPage();
  state.page += 1;
  return MARGIN;
};

/**
 * Generate invoice PDF buffer from order data
 */
const generateInvoicePDF = async (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
      const buffers = [];
      const state = { page: 1 };

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const order = orderData || {};
      const user = order.user || {};
      const vendor = order.vendor || {};
      const items = Array.isArray(order.items) ? order.items : [];
      const pricing = order.pricing || {};
      const payment = order.payment || {};
      const shippingAddress = order.shippingAddress || {};

      const invoiceCode =
        order.invoiceCode ||
        `INV${String(order.orderNumber?.replace('RB', '') || Date.now()).padStart(6, '0')}`;
      const invoiceNumber =
        order.invoiceNumber ||
        `RUSH-INV-${new Date().getFullYear()}-${String(order.orderNumber?.replace('RB', '') || Date.now()).padStart(6, '0')}`;
      const invoiceDate = order.invoiceDate
        ? new Date(order.invoiceDate)
        : order.createdAt
          ? new Date(order.createdAt)
          : new Date();
      const dueDate = order.dueDate
        ? new Date(order.dueDate)
        : (() => {
            const d = new Date(invoiceDate);
            d.setDate(d.getDate() + 30);
            return d;
          })();

      const customerName = user.userName || user.name || 'Customer';
      const customerPhone = user.contactNumber || shippingAddress.phone || 'N/A';
      const customerEmail = user.email || 'N/A';
      const deliveryAddress = formatAddress(shippingAddress);
      const riderName = order.rider?.fullName || order.riderDetails?.riderName || order.riderName || null;
      const riderPhone =
        order.rider?.mobileNumber || order.riderDetails?.mobileNumber || order.riderPhone || null;
      const paymentMethod = (payment.method || 'COD').toUpperCase();
      const paymentStatus = (payment.status || 'PENDING').toUpperCase();

      // Header
      const headerH = 96;
      doc.rect(0, 0, PAGE_WIDTH, headerH).fill(ORANGE);
      doc.rect(0, headerH - 4, PAGE_WIDTH, 4).fill(ORANGE_DARK);

      doc.font('Helvetica-Bold').fontSize(30).fillColor(WHITE).text('INVOICE', MARGIN, 24);
      doc.font('Helvetica').fontSize(10).fillColor(WHITE).text(`Code: ${invoiceCode}`, MARGIN, 62);
      doc.text(`Invoice No: ${invoiceNumber}`, MARGIN, 76);

      doc
        .roundedRect(PAGE_WIDTH - MARGIN - 118, 28, 118, 44, 6)
        .fillOpacity(0.18)
        .fill(WHITE)
        .fillOpacity(1);
      doc.font('Helvetica').fontSize(8).fillColor(WHITE).text('PAYMENT STATUS', PAGE_WIDTH - MARGIN - 108, 36);
      doc.font('Helvetica-Bold').fontSize(11).text(paymentStatus, PAGE_WIDTH - MARGIN - 108, 50);

      let y = headerH + 18;

      // Top info cards
      const cardW = (CONTENT_WIDTH - 20) / 3;
      const cardH = 58;
      const cards = [
        ['INVOICE DATE', formatDate(invoiceDate)],
        ['DUE DATE', formatDate(dueDate)],
        ['ORDER ID', order.orderNumber || 'N/A'],
      ];
      cards.forEach(([label, value], i) => {
        const x = MARGIN + i * (cardW + 10);
        drawPanel(doc, x, y, cardW, cardH);
        doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(label, x + 14, y + 12);
        doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text(value, x + 14, y + 28, {
          width: cardW - 24,
        });
      });

      y += cardH + 16;

      // Company + customer panels (dynamic height)
      const panelW = (CONTENT_WIDTH - 14) / 2;
      const companyLines = [
        { label: 'Email', value: 'info@rushbaskets.com' },
        { label: 'Phone', value: '+91 1800 123 4567' },
        { label: 'Address', value: 'Patna, Bihar, India' },
        { label: 'Website', value: 'www.rushbaskets.com' },
      ];
      const customerLines = [
        { label: 'Email', value: customerEmail },
        { label: 'Phone', value: customerPhone },
        { label: 'Address', value: deliveryAddress },
      ];

      const companyContentH =
        34 +
        companyLines.reduce(
          (sum, line) => sum + Math.max(14, measureTextHeight(doc, line.value, panelW - 96) + 4),
          0
        );
      const customerContentH =
        34 +
        customerLines.reduce(
          (sum, line) => sum + Math.max(14, measureTextHeight(doc, line.value, panelW - 96) + 4),
          0
        );
      const panelH = Math.max(companyContentH, customerContentH, 108);

      drawPanel(doc, MARGIN, y, panelW, panelH);
      let py = drawPanelTitle(doc, 'From', MARGIN + 14, y + 12, panelW - 20);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text('Rush Basket', MARGIN + 14, py);
      py += 16;
      drawKeyValueLines(doc, companyLines, MARGIN + 14, py, panelW - 24);

      const cx = MARGIN + panelW + 14;
      drawPanel(doc, cx, y, panelW, panelH);
      py = drawPanelTitle(doc, 'Bill To', cx + 14, y + 12, panelW - 20);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text(customerName, cx + 14, py);
      py += 16;
      drawKeyValueLines(doc, customerLines, cx + 14, py, panelW - 24);

      y += panelH + 14;

      // Meta strip
      const metaLines = [
        `Payment: ${paymentMethod}`,
        vendor.vendorName || vendor.storeName ? `Vendor: ${vendor.vendorName || vendor.storeName}` : null,
        riderName || riderPhone ? `Rider: ${[riderName, riderPhone].filter(Boolean).join(' | ')}` : null,
      ].filter(Boolean);
      const metaH = 16 + metaLines.length * 14;
      drawPanel(doc, MARGIN, y, CONTENT_WIDTH, metaH);
      metaLines.forEach((line, idx) => {
        doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(line, MARGIN + 14, y + 10 + idx * 14, {
          width: CONTENT_WIDTH - 28,
        });
      });
      y += metaH + 18;

      // Items
      y = ensureSpace(doc, y, 80, state);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text('Invoice Items', MARGIN, y);
      y += 18;

      const tableX = MARGIN;
      const tableW = CONTENT_WIDTH;
      const cols = [
        { label: 'SKU/HSN', x: tableX + 8, w: 70 },
        { label: 'Description', x: tableX + 82, w: 190 },
        { label: 'Qty', x: tableX + 278, w: 36 },
        { label: 'Unit Price', x: tableX + 318, w: 78 },
        { label: 'Total', x: tableX + 402, w: 78 },
      ];

      doc.rect(tableX, y, tableW, 24).fill(ORANGE);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(WHITE);
      cols.forEach((col) => doc.text(col.label, col.x, y + 7, { width: col.w }));
      const tableBodyTop = y;
      y += 24;

      if (items.length === 0) {
        doc.rect(tableX, y, tableW, 28).fill(LIGHT_GRAY);
        doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('No items found', tableX + 8, y + 9);
        y += 28;
      }

      items.forEach((item, index) => {
        const sku = String(item.sku || item.skuHsn || '-');
        const description = item.productName || item.description || 'N/A';
        const quantity = item.quantity || 0;
        const unitPrice = item.salePrice || item.unitPrice || 0;
        const total = item.totalPrice ?? quantity * unitPrice;

        const rowH =
          Math.max(
            26,
            measureTextHeight(doc, description, cols[1].w) + 12,
            measureTextHeight(doc, sku, cols[0].w) + 12
          ) + 4;

        y = ensureSpace(doc, y, rowH + 10, state);
        doc.rect(tableX, y, tableW, rowH).fill(index % 2 === 0 ? WHITE : LIGHT_GRAY);
        doc
          .moveTo(tableX, y + rowH)
          .lineTo(tableX + tableW, y + rowH)
          .strokeColor(BORDER)
          .stroke();

        doc.font('Helvetica').fontSize(9).fillColor(BLACK);
        doc.text(sku, cols[0].x, y + 8, { width: cols[0].w });
        doc.text(description, cols[1].x, y + 8, { width: cols[1].w });
        doc.text(String(quantity), cols[2].x, y + 8, { width: cols[2].w, align: 'center' });
        doc.text(formatMoney(unitPrice), cols[3].x, y + 8, { width: cols[3].w, align: 'right' });
        doc.font('Helvetica-Bold').text(formatMoney(total), cols[4].x, y + 8, {
          width: cols[4].w,
          align: 'right',
        });
        y += rowH;
      });

      doc.lineWidth(1).strokeColor(BORDER).rect(tableX, tableBodyTop, tableW, y - tableBodyTop).stroke();

      // Summary
      y += 16;
      y = ensureSpace(doc, y, 160, state);

      const summaryW = 250;
      const summaryX = PAGE_WIDTH - MARGIN - summaryW;
      const itemCost = pricing.itemCost ?? pricing.subtotal ?? 0;
      const deliveryCharge = pricing.deliveryCharges ?? pricing.deliveryAmount ?? 0;
      const discount = pricing.discount ?? order.coupon?.discount ?? 0;
      const finalTotal = pricing.totalAmount ?? pricing.total ?? payment.amount ?? 0;

      const summaryRows = [['Item Cost', formatMoney(itemCost)]];
      if (Number(pricing.tax) > 0) summaryRows.push(['Total GST', formatMoney(pricing.tax)]);
      if (Number(pricing.handlingCharge) > 0) {
        summaryRows.push(['Handling Charges', formatMoney(pricing.handlingCharge)]);
      }
      if (Number(deliveryCharge) > 0) summaryRows.push(['Delivery Charges', formatMoney(deliveryCharge)]);
      if (Number(discount) > 0) summaryRows.push(['Discount', `- ${formatMoney(discount)}`]);
      if (Number(pricing.totalCashback) > 0) {
        summaryRows.push(['Cashback', formatMoney(pricing.totalCashback)]);
      }

      const summaryH = 20 + summaryRows.length * 20 + 34;
      drawPanel(doc, summaryX, y, summaryW, summaryH);

      let sy = y + 14;
      summaryRows.forEach(([label, value]) => {
        drawSummaryRow(doc, label, value, summaryX + 14, sy, summaryW - 28);
        sy += 20;
      });

      sy += 4;
      doc
        .moveTo(summaryX + 14, sy)
        .lineTo(summaryX + summaryW - 14, sy)
        .strokeColor(ORANGE)
        .lineWidth(1)
        .stroke();
      sy += 10;
      drawSummaryRow(doc, 'Total Amount', formatMoney(finalTotal), summaryX + 14, sy, summaryW - 28, {
        bold: true,
        color: ORANGE,
      });

      y += summaryH + 24;

      // Footer (dynamic)
      y = ensureSpace(doc, y, 50, state);
      doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor(BORDER).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Thank you for shopping with Rush Basket!', MARGIN, y + 10, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
      doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(
        'This is a computer-generated invoice and does not require a signature.',
        MARGIN,
        y + 24,
        { width: CONTENT_WIDTH, align: 'center' }
      );

      doc.end();
    } catch (error) {
      logger.error('PDF generation error:', error);
      reject(error);
    }
  });
};

module.exports = { generateInvoicePDF };
