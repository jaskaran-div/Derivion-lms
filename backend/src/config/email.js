const nodemailer = require('nodemailer');

// Only SMTP_USER and SMTP_PASS are required: the server defaults to Gmail and the sender to SMTP_USER
process.env.APP_NAME = process.env.APP_NAME || 'Derivion Learning Hub';
process.env.APP_URL = process.env.APP_URL || (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Fail fast when SMTP is unreachable (e.g. hosts that block outbound SMTP) instead of hanging the request
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

// Same layout and building blocks as the queued emails (services/emailService.js), so every message looks alike
const L = require('../services/emailLayout');

const hi = (name) => L.paragraph(`Hi ${name || 'there'},`);

// Subjects are plain text (not HTML), so they use the raw values; only the markup is escaped.
const emailTemplates = {
  welcome: (firstName) => ({
    subject: `Welcome to ${process.env.APP_NAME}`,
    html: L.render(
      L.heading(`Welcome, ${firstName || 'there'}!`)
      + L.paragraph(`Your ${process.env.APP_NAME} account is ready. You can now explore our courses, learn at your own pace, track your progress and earn certificates as you complete them.`)
      + L.button(`${L.absUrl('/dashboard')}`, 'Go to my dashboard')
      + L.paragraph('If you have any questions, our support team is happy to help.', { muted: true }),
      { preheader: 'Your account is ready. Start learning today.', reason: `You received this email because you created an account on ${process.env.APP_NAME}.` },
    ),
  }),

  enrollmentConfirmation: (firstName, courseName) => ({
    subject: `You're enrolled in "${courseName}"`,
    html: L.render(
      L.heading('Enrollment confirmed')
      + hi(firstName)
      + L.paragraph('Great news, you are now enrolled in:')
      + L.callout(courseName, 'You have full access to the course materials, videos and resources.', 'success')
      + L.paragraph('Track your progress as you learn and earn your certificate on completion.')
      + L.button(L.absUrl('/dashboard'), 'Start learning'),
      { preheader: `You are now enrolled in ${courseName}.`, reason: `You received this email because you enrolled in a course on ${process.env.APP_NAME}.` },
    ),
  }),

  emailVerification: (firstName, verifyUrl) => ({
    subject: `Verify your email address — ${process.env.APP_NAME}`,
    html: L.render(
      L.heading('Confirm your email address')
      + hi(firstName)
      + L.paragraph('Please confirm your email address to activate your account. This link expires in 24 hours.')
      + L.button(verifyUrl, 'Verify email address')
      + L.linkFallback(verifyUrl)
      + L.paragraph('If you did not create an account, you can safely ignore this email.', { muted: true, small: true }),
      { preheader: 'Confirm your email address to activate your account.', reason: `You received this email because this address was used to sign up on ${process.env.APP_NAME}.` },
    ),
  }),

  // Any in-app notification, mirrored by email. forGuardian: written to a learner's parent/guardian.
  notification: ({ name, title, message, link, forGuardian = false }) => ({
    subject: `${title} — ${process.env.APP_NAME}`,
    html: L.render(
      L.heading(title)
      + hi(forGuardian ? 'there' : name)
      + (forGuardian ? L.paragraphHtml(`You are receiving this as the guardian of <strong>${L.esc(name)}</strong>.`, { muted: true, small: true }) : '')
      + `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;white-space:pre-line;">${L.esc(message)}</p>`
      + (link ? L.button(L.absUrl(link), `Open ${process.env.APP_NAME}`) : ''),
      {
        preheader: String(message || '').replace(/\s+/g, ' ').slice(0, 110),
        reason: forGuardian
          ? `You received this email as the guardian of a learner on ${process.env.APP_NAME}.`
          : `You received this email because you have an account on ${process.env.APP_NAME}.`,
      },
    ),
  }),

  emailOtp: (firstName, otp) => ({
    subject: `${otp} is your ${process.env.APP_NAME} verification code`,
    html: L.render(
      L.heading('Your verification code')
      + hi(firstName)
      + L.paragraph('Enter this code to verify your email address. It expires in 10 minutes.')
      + L.codeBox(otp)
      + L.paragraph('Never share this code with anyone. If you did not try to sign in, you can ignore this email and consider changing your password.', { muted: true, small: true }),
      { preheader: `Your verification code is ${otp}. It expires in 10 minutes.`, reason: `You received this email because a sign-in or sign-up was attempted with this address on ${process.env.APP_NAME}.` },
    ),
  }),

  passwordReset: (firstName, resetUrl) => ({
    subject: `Reset your password — ${process.env.APP_NAME}`,
    html: L.render(
      L.heading('Reset your password')
      + hi(firstName)
      + L.paragraph('We received a request to reset the password for your account. Click the button below to choose a new one.')
      + L.button(resetUrl, 'Reset password')
      + L.linkFallback(resetUrl)
      + L.callout('This link expires in 1 hour', 'If you did not request a password reset, you can ignore this email. Your password will not change.', 'warning'),
      { preheader: 'Use this link within 1 hour to choose a new password.', reason: `You received this email because a password reset was requested for your ${process.env.APP_NAME} account.` },
    ),
  }),
};

const emailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

// Resolves true when the email was handed to the mail server
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || process.env.APP_NAME}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: L.toText(html),
    });
    return true;
  } catch (error) {
    console.error('Email sending failed:', error.message || error);
    // Don't throw - email failures shouldn't break the request
    return false;
  }
};

module.exports = { sendEmail, emailTemplates, emailConfigured };
