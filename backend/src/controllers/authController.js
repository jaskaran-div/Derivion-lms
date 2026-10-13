const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const { sendEmail, emailTemplates } = require('../config/email');
const { logAudit } = require('./auditController');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

/** Hash a refresh token for storage — we never store raw tokens */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, phone },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    // Send welcome email (non-blocking)
    const { subject, html } = emailTemplates.welcome(firstName);
    sendEmail({ to: email, subject, html });

    await logAudit({ userId: user.id, action: 'USER_CREATED', targetId: user.id, targetType: 'user', req });

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: { user, accessToken, refreshToken },
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

    if (!user.isActive) {
      await logAudit({ userId: user.id, action: 'LOGIN', details: { success: false, reason: 'account deactivated' }, req });
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAudit({ userId: user.id, action: 'LOGIN', details: { success: false, reason: 'wrong password' }, req });
      return res.status(401).json({ success: false, message: 'Invalid login ID or password.' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    await logAudit({ userId: user.id, action: 'LOGIN', details: { success: true }, req });

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          avatar: user.avatar,
          mustChangePassword: user.mustChangePassword,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

// POST /api/auth/refresh
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    // Check if the token has been revoked
    const tokenHash = hashToken(token);
    const revoked = await prisma.revokedToken.findUnique({ where: { tokenHash } });
    if (revoked) {
      return res.status(401).json({ success: false, message: 'Token has been revoked. Please login again.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    // Rotate: revoke the old token, issue a new pair
    const expiresAt = new Date(decoded.exp * 1000);
    await prisma.revokedToken.upsert({
      where: { tokenHash },
      create: { userId: user.id, tokenHash, expiresAt },
      update: {},
    });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);

    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      const tokenHash = hashToken(token);
      try {
        const decoded = jwt.decode(token);
        const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma.revokedToken.upsert({
          where: { tokenHash },
          create: { userId: req.user?.id || decoded?.userId, tokenHash, expiresAt },
          update: {},
        });
      } catch { /* ignore */ }
    }

    if (req.user?.id) {
      await logAudit({ userId: req.user.id, action: 'LOGOUT', req });
    }

    res.json({ success: true, message: 'Logged out.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: resetToken, resetPasswordExpiry: resetExpiry },
    });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
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
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        mustChangePassword: false,
      },
    });

    await logAudit({ userId: user.id, action: 'PASSWORD_CHANGE', details: { method: 'reset' }, req });

    res.json({ success: true, message: 'Password reset successful. Please login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

// PUT /api/auth/me
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, phone },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true },
    });
    res.json({ success: true, message: 'Profile updated.', data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    await logAudit({ userId: req.user.id, action: 'PASSWORD_CHANGE', details: { method: 'self_change' }, req });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

module.exports = {
  register, login, refreshToken, logout,
  forgotPassword, resetPassword,
  getMe, updateProfile, changePassword,
};
