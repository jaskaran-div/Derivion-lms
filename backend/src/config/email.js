const nodemailer = require('nodemailer');

// Only SMTP_USER and SMTP_PASS are required: the server defaults to Gmail and the sender to SMTP_USER
process.env.APP_NAME = process.env.APP_NAME || 'Derivion LMS';
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
});

// User-supplied values (names, course titles) must not be interpreted as HTML
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

const emailTemplates = {
  welcome: (rawFirstName, firstName = esc(rawFirstName)) => ({
    subject: `Welcome to ${process.env.APP_NAME}! 🎓`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #1d4ed8, #6d3df5); padding: 40px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 700; }
          .body { padding: 40px; }
          .body p { color: #374151; line-height: 1.7; font-size: 16px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1d4ed8, #6d3df5); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 24px 0; }
          .footer { background: #f8fafc; padding: 24px 40px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 ${process.env.APP_NAME}</h1>
          </div>
          <div class="body">
            <h2>Welcome, ${firstName}! 🎉</h2>
            <p>We're excited to have you on board. Your account has been created successfully and you're ready to start learning!</p>
            <p>Explore thousands of courses, track your progress, and earn certificates as you grow your skills.</p>
            <a href="${process.env.APP_URL}/dashboard" class="btn">Start Learning →</a>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Happy Learning,<br><strong>The ${process.env.APP_NAME} Team</strong></p>
          </div>
          <div class="footer">
            <p>© 2024 ${process.env.APP_NAME}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  enrollmentConfirmation: (rawFirstName, rawCourseName, firstName = esc(rawFirstName), courseName = esc(rawCourseName)) => ({
    subject: `🎓 Enrolled in "${courseName}" - ${process.env.APP_NAME}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #10b981, #059669); padding: 40px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
          .body { padding: 40px; }
          .body p { color: #374151; line-height: 1.7; font-size: 16px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1d4ed8, #6d3df5); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 24px 0; }
          .course-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
          .footer { background: #f8fafc; padding: 24px 40px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Enrollment Confirmed!</h1>
          </div>
          <div class="body">
            <h2>Hi ${firstName}!</h2>
            <p>Great news! You're now enrolled in:</p>
            <div class="course-box">
              <strong style="font-size: 18px; color: #065f46;">${courseName}</strong>
            </div>
            <p>You can now access all course materials, videos, and resources. Track your progress and earn your certificate upon completion!</p>
            <a href="${process.env.APP_URL}/dashboard" class="btn">Go to Course →</a>
          </div>
          <div class="footer">
            <p>© 2024 ${process.env.APP_NAME}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  emailVerification: (rawFirstName, verifyUrl, firstName = esc(rawFirstName)) => ({
    subject: `Verify your email for ${process.env.APP_NAME}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; background: #f4f5f8; margin: 0; padding: 0;">
        <div style="max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden;">
          <div style="background: #1d4ed8; padding: 32px; text-align: center; color: #fff; font-size: 22px; font-weight: 700;">${esc(process.env.APP_NAME)}</div>
          <div style="padding: 32px; color: #343a46; line-height: 1.7; font-size: 15px;">
            <p>Hi ${firstName},</p>
            <p>Please confirm your email address to activate your account. This link expires in 24 hours.</p>
            <p style="text-align: center;"><a href="${verifyUrl}" style="display: inline-block; background: #0f1115; color: #fff; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600;">Verify Email</a></p>
            <p style="color: #6b7280; font-size: 13px;">If you did not create an account, you can ignore this email.</p>
          </div>
        </div>
      </body></html>`,
  }),

  // Any in-app notification, mirrored by email. forGuardian: written to a learner's parent/guardian.
  notification: ({ name, title, message, link, forGuardian = false }) => ({
    subject: `${title} — ${process.env.APP_NAME}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; background: #f4f5f8; margin: 0; padding: 0;">
        <div style="max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden;">
          <div style="background: #0f1115; padding: 24px; text-align: center; color: #fff; font-size: 20px; font-weight: 700;">${esc(process.env.APP_NAME)}</div>
          <div style="padding: 32px; color: #343a46; line-height: 1.7; font-size: 15px;">
            <p>Hi ${esc(forGuardian ? 'there' : name)},</p>
            ${forGuardian ? `<p style="color: #6b7280; font-size: 13px;">You are receiving this as the guardian of <strong>${esc(name)}</strong>.</p>` : ''}
            <h2 style="font-size: 18px; color: #0f1115; margin: 16px 0 8px;">${esc(title)}</h2>
            <p style="white-space: pre-line;">${esc(message)}</p>
            ${link ? `<p style="text-align: center; margin-top: 24px;"><a href="${esc(/^https?:\/\//.test(link) ? link : process.env.APP_URL + link)}" style="display: inline-block; background: #0f1115; color: #fff; padding: 12px 28px; border-radius: 999px; text-decoration: none; font-weight: 600;">Open ${esc(process.env.APP_NAME)}</a></p>` : ''}
          </div>
          <div style="padding: 16px 32px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #f0f1f4;">You received this email because you have an account on ${esc(process.env.APP_NAME)}.</div>
        </div>
      </body></html>`,
  }),

  emailOtp: (rawFirstName, otp, firstName = esc(rawFirstName)) => ({
    subject: `${otp} is your ${process.env.APP_NAME} verification code`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; background: #f4f5f8; margin: 0; padding: 0;">
        <div style="max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden;">
          <div style="background: #0f1115; padding: 28px; text-align: center; color: #fff; font-size: 22px; font-weight: 700;">${esc(process.env.APP_NAME)}</div>
          <div style="padding: 32px; color: #343a46; line-height: 1.7; font-size: 15px;">
            <p>Hi ${firstName},</p>
            <p>Use this code to verify your email address. It expires in 10 minutes.</p>
            <p style="text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f1115; margin: 24px 0;">${esc(otp)}</p>
            <p style="color: #6b7280; font-size: 13px;">If you did not try to sign in, you can ignore this email and consider changing your password.</p>
          </div>
        </div>
      </body></html>`,
  }),

  passwordReset: (rawFirstName, resetUrl, firstName = esc(rawFirstName)) => ({
    subject: `🔒 Password Reset - ${process.env.APP_NAME}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; }
          .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #f59e0b, #d97706); padding: 40px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 24px; }
          .body { padding: 40px; }
          .body p { color: #374151; line-height: 1.7; font-size: 16px; }
          .btn { display: inline-block; background: #f59e0b; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 24px 0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; color: #92400e; font-size: 14px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Password Reset Request</h1>
          </div>
          <div class="body">
            <h2>Hi ${firstName},</h2>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="btn">Reset Password →</a>
            <div class="warning">⚠️ This link expires in <strong>1 hour</strong>. If you didn't request a password reset, please ignore this email.</div>
          </div>
          <div class="footer">
            <p>© 2024 ${process.env.APP_NAME}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
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
    });
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    // Don't throw - email failures shouldn't break the request
    return false;
  }
};

module.exports = { sendEmail, emailTemplates, emailConfigured };
