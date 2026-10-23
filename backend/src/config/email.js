const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
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

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    // Don't throw - email failures shouldn't break the request
  }
};

module.exports = { sendEmail, emailTemplates };
