/**
 * Renders a certificate as a landscape A4 PDF and streams it to `out` (an HTTP response or any writable).
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '../../assets/derivion-logo.png');
const LOGO_RATIO = 1600 / 386; // width / height of the wordmark image

const BLUE = '#1d4ed8';
const VIOLET = '#6d3df5';
const INK = '#111318';
const MUTED = '#6b7280';

const renderCertificatePdf = (cert, out, { siteName = 'Derivion LMS', verifyUrl } = {}) => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate ${cert.certificateNo}` } });
  doc.pipe(out);

  const W = doc.page.width;
  const H = doc.page.height;

  // Frame
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.rect(24, 24, W - 48, H - 48).lineWidth(2).stroke(BLUE);
  doc.rect(34, 34, W - 68, H - 68).lineWidth(0.75).stroke('#c9d8ff');
  doc.rect(24, 24, W - 48, 10).fill(BLUE);
  doc.rect(24, 24, (W - 48) * 0.35, 10).fill(VIOLET);

  // Brand: the Derivion wordmark (falls back to the site name if the image is missing)
  if (fs.existsSync(LOGO_PATH)) {
    const logoH = 34;
    doc.image(LOGO_PATH, (W - logoH * LOGO_RATIO) / 2, 58, { height: logoH });
  } else {
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(16).text(siteName.toUpperCase(), 0, 70, { align: 'center', characterSpacing: 2 });
  }

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(38).text('Certificate of Completion', 0, 112, { align: 'center' });

  doc.fillColor(MUTED).font('Helvetica').fontSize(14).text('This is to certify that', 0, 182, { align: 'center' });

  const name = `${cert.user.firstName} ${cert.user.lastName}`.trim();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(32).text(name, 60, 210, { align: 'center', width: W - 120 });
  const lineY = 258;
  doc.moveTo(W / 2 - 180, lineY).lineTo(W / 2 + 180, lineY).lineWidth(1).stroke('#d3d6dd');

  doc.fillColor(MUTED).font('Helvetica').fontSize(14).text('has successfully completed the course', 0, 276, { align: 'center' });
  doc.fillColor(VIOLET).font('Helvetica-Bold').fontSize(24).text(cert.course.title, 80, 302, { align: 'center', width: W - 160 });

  // Footer: date, certificate number, verification
  const issued = new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const footY = H - 150;
  doc.fillColor(MUTED).font('Helvetica').fontSize(11);
  doc.text('Date of issue', 90, footY, { width: 220, align: 'left' });
  doc.text('Certificate No.', W - 310, footY, { width: 220, align: 'right' });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14);
  doc.text(issued, 90, footY + 16, { width: 220, align: 'left' });
  doc.text(cert.certificateNo, W - 310, footY + 16, { width: 220, align: 'right' });

  if (verifyUrl) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(`Verify this certificate at ${verifyUrl}`, 0, H - 78, { align: 'center', link: verifyUrl, underline: false });
  }

  doc.end();
};

module.exports = { renderCertificatePdf };
