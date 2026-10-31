const prisma = require('../config/database');
const invoices = require('../services/invoices');

// GET /api/payments/:id/invoice - the buyer (or an admin) downloads the invoice PDF for a payment
const downloadInvoice = async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { paymentId: req.params.id } });
    if (!invoice || (invoice.userId !== req.user.id && req.user.role !== 'ADMIN')) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }
    const { pdf } = await invoices.getPdf(invoice.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (error) {
    console.error('Invoice download error:', error);
    res.status(500).json({ success: false, message: 'Failed to load invoice.' });
  }
};

module.exports = { downloadInvoice };
