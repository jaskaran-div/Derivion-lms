const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const { sendEmail, emailTemplates } = require('../config/email');
const { logAudit } = require('./auditController');
const { getSettings } = require('../services/settings');

const REFRESH_COOKIE = 'lms_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

/** Hash a token for storage — raw refresh/reset/verify tokens are never stored */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// The refresh token lives in an httpOnly cookie so page scripts can never read it.
// In production the frontend and API are on different sites, so the cookie must be SameSite=None.
const cookieOptions = () => {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TTL_MS,
  };
};

const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, cookieOptions());
const clearRefreshCookie = (res) => {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
};

// First configured client origin (CLIENT_URL may be a comma-separated list)
const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();

// A token issued before the last password change is no longer valid
const issuedBeforePasswordChange = (decoded, passwordChangedAt) =>
  Boolean(passwordChangedAt) && decoded.iat * 1000 < new Date(passwordChangedAt).getTime() - 1000;

const sendVerificationEmail = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: hashToken(token), emailVerifyExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  const verifyUrl = `${clientUrl()}/verify-email?token=${token}`;
  const { subject, html } = emailTemplates.emailVerification(user.firstName, verifyUrl);
  await sendEmail({ to: user.email, subject, html });
};

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  avatar: user.avatar,
  mustChangePassword: user.mustChangePassword,
  isEmailVerified: user.isEmailVerified,
});

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const { enrollment } = await getSettings();

    if (!enrollment.allowSelfRegistration) {
      return res.status(403).json({ success: false, message: 'Self registration is currently disabled. Contact your school or administrator.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, phone },
    });

    await logAudit({ userId: user.id, action: 'USER_CREATED', targetId: user.id, targetType: 'user', req });

    if (enrollment.requireEmailVerification) {
      await sendVerificationEmail(user);
      return res.status(201).json({
        success: true,
        message: 'Account created. Check your email to verify your address before logging in.',
        data: { requiresVerification: true },
      });
    }

    const { subject, html } = emailTemplates.welcome(firstName);
    sendEmail({ to: email, subject, html });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: { user: publicUser(user), accessToken },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const identifier = (req.body.email || req.body.username || '').trim();
    const { password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      await logAudit({ action: 'LOGIN', details: { identifier, success: false, reason: 'user not found' }, req });
      return res.status(401).json({ success: false, message: 'Invalid login ID or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAudit({ userId: user.id, action: 'LOGIN', details: { success: false, reason: 'wrong password' }, req });
      return res.status(401).json({ success: false, message: 'Invalid login ID or password.' });
    }

    if (!user.isActive) {
      await logAudit({ userId: user.id, action: 'LOGIN', details: { success: false, reason: 'account deactivated' }, req });
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    // Only accounts that started email verification (self-registered while it was required) are blocked;
    // admin/teacher-created and older accounts are never locked out by turning the setting on.
    const { enrollment } = await getSettings();
    if (enrollment.requireEmailVerification && !user.isEmailVerified && user.emailVerifyToken) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address first. Check your inbox for the verification link.',
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    setRefreshCookie(res, refreshToken);

    await logAudit({ userId: user.id, action: 'LOGIN', details: { success: true }, req });

    res.json({
      success: true,
      message: 'Login successful.',
      data: { user: publicUser(user), accessToken },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

// POST /api/auth/refresh — reads the httpOnly refresh cookie, rotates it, returns a new access token
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const tokenHash = hashToken(token);
    const revoked = await prisma.revokedToken.findUnique({ where: { tokenHash } });
    if (revoked) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Token has been revoked. Please login again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true, passwordChangedAt: true },
    });

    if (!user || !user.isActive || issuedBeforePasswordChange(decoded, user.passwordChangedAt)) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }

    // Rotate: revoke the old token, issue a new pair
    await prisma.revokedToken.upsert({
      where: { tokenHash },
      create: { userId: user.id, tokenHash, expiresAt: new Date(decoded.exp * 1000) },
      update: {},
    });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);
    setRefreshCookie(res, newRefreshToken);

    res.json({ success: true, data: { accessToken } });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        const decoded = jwt.decode(token);
        const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + REFRESH_TTL_MS);
        const userId = req.user?.id || decoded?.userId;
        if (userId) {
          await prisma.revokedToken.upsert({
            where: { tokenHash: hashToken(token) },
            create: { userId, tokenHash: hashToken(token), expiresAt },
            update: {},
          });
        }
      } catch { /* ignore */ }
    }
    clearRefreshCookie(res);

    if (req.user?.id) {
      await logAudit({ userId: req.user.id, action: 'LOGOUT', req });
    }

    res.json({ success: true, message: 'Logged out.' });
  } catch {
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: hashToken(resetToken), resetPasswordExpiry: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const resetUrl = `${clientUrl()}/reset-password?token=${resetToken}`;
    const { subject, html } = emailTemplates.passwordReset(user.firstName, resetUrl);
    await sendEmail({ to: email, subject, html });

    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashToken(String(token)),
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        mustChangePassword: false,
        passwordChangedAt: new Date(), // signs out every existing session
        // Proving access to the inbox also verifies the email
        isEmailVerified: true,
      },
    });

    await logAudit({ userId: user.id, action: 'PASSWORD_CHANGE', details: { method: 'reset' }, req });

    res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// POST /api/auth/verify-email { token }
const verifyEmail = async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: hashToken(String(req.body.token || '')), emailVerifyExpiry: { gt: new Date() } },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'This verification link is invalid or has expired.' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    });
    const { subject, html } = emailTemplates.welcome(user.firstName);
    sendEmail({ to: user.email, subject, html });
    res.json({ success: true, message: 'Email verified. You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify email.' });
  }
};

// POST /api/auth/resend-verification { email }
const resendVerification = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: String(req.body.email || '') } });
    if (user && !user.isEmailVerified && user.isActive) await sendVerificationEmail(user);
    res.json({ success: true, message: 'If the account needs verification, a new link has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Failed to send verification email.' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        mustChangePassword: true,
        guardianEmail: true,
        guardianPhone: true,
        createdAt: true,
        lastLogin: true,
        _count: {
          select: { enrollments: true, certificates: true },
        },
      },
    });
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

// PUT /api/auth/me
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const data = {};
    if (typeof firstName === 'string' && firstName.trim()) data.firstName = firstName.trim().slice(0, 100);
    if (typeof lastName === 'string' && lastName.trim()) data.lastName = lastName.trim().slice(0, 100);
    if (phone !== undefined) data.phone = phone ? String(phone).trim().slice(0, 30) : null;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true },
    });
    res.json({ success: true, message: 'Profile updated.', data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// POST /api/auth/change-password — signs out other sessions, keeps this one
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = await bcrypt.compare(String(currentPassword || ''), user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current one.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword, mustChangePassword: false, passwordChangedAt: new Date() },
    });

    await logAudit({ userId: req.user.id, action: 'PASSWORD_CHANGE', details: { method: 'self_change' }, req });

    // Tokens issued from now on are valid; give this device a fresh pair
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    setRefreshCookie(res, refreshToken);

    res.json({ success: true, message: 'Password changed successfully. Other devices have been signed out.', data: { accessToken } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

module.exports = {
  register, login, refreshToken, logout,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  getMe, updateProfile, changePassword,
  hashToken, issuedBeforePasswordChange, REFRESH_COOKIE,
};
