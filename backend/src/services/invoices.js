/**
 * Invoices. The Invoice row is created inside the payment transaction (one per payment, enforced by a unique key);
 * the PDF is rendered from that snapshot when first needed and cached on the row.
 *
 * Company and tax details come from configuration only (INVOICE_* variables). Nothing is invented: a tax line is
 * printed only when INVOICE_TAX_ID / INVOICE_TAX_RATE are actually set.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const prisma = require('../config/database');
const { config } = require('../config/integration');

const LOGO_PATH = path.join(__dirname, '../../assets/derivion-logo.png');
const LOGO_RATIO = 1600 / 386;

const formatMoney = (amount, currency = 'INR') => {
  const n = Number(amount);
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// PDF text uses the built-in Helvetica, which has no rupee glyph (it would print as a stray superscript "1").
// The PDF therefore shows the ISO currency code; HTML emails use formatMoney with the real symbol.
const pdfMoney = (amount, currency = 'INR') =>
  `${currency} ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const company = () => {
  const e = process.env;
  const rate = parseFloat(e.INVOICE_TAX_RATE);
  return {
    name: e.INVOICE_COMPANY_NAME || config().appName,
    address: (e.INVOICE_COMPANY_ADDRESS || '').split('|').map((l) => l.trim()).filter(Boolean),
    taxId: e.INVOICE_TAX_ID || '',
    taxLabel: e.INVOICE_TAX_LABEL || 'GSTIN',
    taxRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
  };
};

/** Create the invoice for a payment. Safe to call once per payment (unique paymentId). `db` may be a transaction client. */
const createForPayment = async (db, { payment, user, course, enrollmentId }) => {
  const [{ nextval }] = await db.$queryRaw`SELECT nextval(pg_get_serial_sequence('invoices', 'seq')) AS nextval`;
  const seq = Number(nextval);
  const year = new Date().getFullYear();
  return db.invoice.create({
    data: {
      seq,
      invoiceNumber: `INV-${year}-${String(seq).padStart(5, '0')}`,
      paymentId: payment.id,
      enrollmentId: enrollmentId || null,
      userId: user.id,
      learnerName: `${user.firstName} ${user.lastName || ''}`.trim(),
      learnerEmail: user.email,
      courseTitle: course.title,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      paymentReference: payment.razorpayPaymentId || payment.razorpayOrderId || null,
    },
  });
};

const renderPdf = (invoice) => new Promise((resolve, reject) => {
  const co = company();
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${invoice.invoiceNumber}` } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const left = 50;
  const right = doc.page.width - 50;
  const ink = '#111318';
  const muted = '#6b7280';

  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, left, 45, { width: 36 * LOGO_RATIO, height: 36 });
  else doc.font('Helvetica-Bold').fontSize(18).fillColor(ink).text(co.name, left, 50);

  doc.font('Helvetica-Bold').fontSize(22).fillColor(ink).text('INVOICE', left, 50, { width: right - left, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(muted)
    .text(`No. ${invoice.invoiceNumber}`, left, 80, { width: right - left, align: 'right' })
    .text(`Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, { width: right - left, align: 'right' });

  doc.moveTo(left, 115).lineTo(right, 115).strokeColor('#e5e7eb').stroke();

  // From / Bill to
  doc.font('Helvetica-Bold').fontSize(10).fillColor(muted).text('FROM', left, 135).text('BILL TO', 320, 135);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(co.name, left, 152, { width: 240 });
  doc.font('Helvetica').fontSize(10).fillColor(muted);
  co.address.forEach((line) => doc.text(line, left, doc.y, { width: 240 }));
  if (co.taxId) doc.text(`${co.taxLabel}: ${co.taxId}`, left, doc.y, { width: 240 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(invoice.learnerName, 320, 152, { width: 225 });
  doc.font('Helvetica').fontSize(10).fillColor(muted).text(invoice.learnerEmail, 320, doc.y, { width: 225 });

  // Line item
  const top = 250;
  doc.rect(left, top, right - left, 24).fill('#f3f4f6');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(ink)
    .text('Description', left + 10, top + 7)
    .text('Amount', left, top + 7, { width: right - left - 10, align: 'right' });
  doc.font('Helvetica').fontSize(11).fillColor(ink)
    .text(invoice.courseTitle, left + 10, top + 38, { width: 340 })
    .text(pdfMoney(invoice.amount, invoice.currency), left, top + 38, { width: right - left - 10, align: 'right' });

  let y = Math.max(doc.y, top + 38) + 30;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();
  y += 14;

  const total = Number(invoice.amount);
  if (co.taxRate) {
    // Prices are tax-inclusive: show the tax portion contained in the total
    const net = total / (1 + co.taxRate / 100);
    doc.font('Helvetica').fontSize(10).fillColor(muted)
      .text('Amount before tax', left, y, { width: right - left - 120, align: 'right' }).text(pdfMoney(net, invoice.currency), right - 110, y, { width: 100, align: 'right' });
    y += 16;
    doc.text(`Tax included (${co.taxRate}%)`, left, y, { width: right - left - 120, align: 'right' }).text(pdfMoney(total - net, invoice.currency), right - 110, y, { width: 100, align: 'right' });
    y += 20;
  }
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink)
    .text('Total paid', left, y, { width: right - left - 120, align: 'right' }).text(pdfMoney(total, invoice.currency), right - 110, y, { width: 100, align: 'right' });

  y += 50;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(muted).text('PAYMENT', left, y);
  doc.font('Helvetica').fontSize(10).fillColor(ink)
    .text('Status: PAID', left, y + 16)
    .text(`Payment reference: ${invoice.paymentReference || '—'}`, left, doc.y)
    .text(`Enrollment: ${invoice.enrollmentId || '—'}`, left, doc.y);

  doc.font('Helvetica').fontSize(9).fillColor(muted)
    .text('This is a computer-generated invoice and does not require a signature.', left, doc.page.height - 70, { width: right - left, align: 'center' });
  doc.end();
});

/** Returns the PDF bytes, rendering and caching them on first use. */
const getPdf = async (invoiceId) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  if (invoice.pdf) return { invoice, pdf: Buffer.from(invoice.pdf) };
  const pdf = await renderPdf(invoice);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdf } });
  return { invoice, pdf };
};

module.exports = { createForPayment, renderPdf, getPdf, formatMoney };
