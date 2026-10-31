/**
 * SMTP provider (Gmail by default), using the same environment variables as the existing mailer in config/email.js.
 * Moving to Amazon SES (or any transactional provider) later means adding another file with the same `send` shape
 * and selecting it with EMAIL_PROVIDER; templates and the queue do not change.
 */
const nodemailer = require('nodemailer');

let transporter;
const getTransporter = () => {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
  return transporter;
};

/**
 * @param {{to: string, subject: string, html: string, attachments?: Array, messageId?: string}} message
 * @returns {Promise<{messageId: string}>} rejects on failure
 */
const send = async ({ to, subject, html, attachments, messageId }) => {
  const info = await getTransporter().sendMail({
    from: `"${process.env.FROM_NAME || process.env.APP_NAME || 'Derivion Learning Hub'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
    ...(messageId && { messageId }),
  });
  return { messageId: info.messageId };
};

module.exports = { name: 'smtp', send };
