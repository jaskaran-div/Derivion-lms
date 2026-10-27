const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const { sendEmail, emailTemplates, emailConfigured } = require('../config/email');
const { logAudit } = require('./auditController');
const { getSettings } = require('../services/settings');
const { isSchoolLearner } = require('../services/learners');

const REFRESH_COOKIE = 'lms_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// sid ties a learner's tokens to their one active session (see activeSessionId)
const generateTokens = (userId, role, sid) => {
  const accessToken = jwt.sign({ userId, role, ...(sid && { sid }) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ userId, ...(sid && { sid }) }, process.env.JWT_REFRESH_SECRET, {
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

// Learners may be signed in on one device only: tokens from an older session are rejected
const sessionReplaced = (user, decoded) =>
  user.role === 'STUDENT' && Boolean(user.activeSessionId) && decoded.sid !== user.activeSessionId;

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

// ==================== EMAIL OTP ====================
// Individual learners confirm their email with a 6-digit code before their first sign-in.
// School learners are skipped: their accounts are issued by the school and often have no real inbox.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_GAP_MS = 60 * 1000;
// A separate secret so an OTP session token can never be used as an access token
const otpSecret = () => `${process.env.JWT_SECRET}:email-otp`;

const signOtpToken = (userId) => jwt.sign({ userId, purpose: 'email-otp' }, otpSecret(), { expiresIn: '30m' });
const readOtpToken = (token) => {
  try {
    const decoded = jwt.verify(String(token || ''), otpSecret());
    return decoded.purpose === 'email-otp' ? decoded.userId : null;
  } catch {
    return null;
  }
};

const otpHash = (userId, otp) => hashToken(`${userId}:${otp}`);

const maskEmail = (email) => email.replace(/^(.{2})[^@]*(@.*)$/, (_, a, b) => `${a}•••${b}`);

const needsEmailOtp = async (user) =>
  user.role === 'STUDENT' && !user.isEmailVerified && emailConfigured() && !(await isSchoolLearner(user.id));

const sendEmailOtp = async (user) => {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: otpHash(user.id, otp), emailVerifyExpiry: new Date(Date.now() + OTP_TTL_MS), emailOtpAttempts: 0 },
  });
  const { subject, html } = emailTemplates.emailOtp(user.firstName, otp);
  return sendEmail({ to: user.email, subject, html });
};

// Starts the OTP step: emails a code and tells the client to ask for it
const requireEmailOtp = async (res, user, status = 200) => {
  if (!(await sendEmailOtp(user))) {
    return res.status(503).json({ success: false, message: 'We could not send your verification code. Please try again in a few minutes.' });
  }
  return res.status(status).json({
    success: true,
    message: `We sent a 6-digit verification code to ${maskEmail(user.email)}.`,
    data: { otpRequired: true, otpToken: signOtpToken(user.id), email: maskEmail(user.email) },
  });
};

const learnerType = async (user) =>
  user.role !== 'STUDENT' ? null : (await isSchoolLearner(user.id)) ? 'SCHOOL' : 'INDIVIDUAL';

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

// POST /api/auth/register — individual learners sign up themselves and confirm their email with a code.
// The account stays unusable until the code is entered (login asks for a new code until then).
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    const { enrollment } = await getSettings();

    if (!enrollment.allowSelfRegistration) {
      return res.status(403).json({ success: false, message: 'Sign-up is currently turned off. Contact your school or administrator.' });
    }
    // Without email we can't verify the address, so no account is created
    if (!emailConfigured()) {
      return res.status(503).json({ success: false, message: 'Sign-up is temporarily unavailable. Please try again later.' });
    }

    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) {
      // Started signing up but never entered the code: point them to login, which sends a fresh code
      const pending = existing.role === 'STUDENT' && !existing.isEmailVerified && !existing.lastLogin && !existing.createdById;
      return res.status(409).json({
        success: false,
        code: pending ? 'VERIFICATION_PENDING' : 'EMAIL_TAKEN',
        message: pending
          ? 'You already started signing up with this email. Log in with your password to get a new verification code.'
          : 'An account with this email already exists. Please log in.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: phone ? String(phone).trim().slice(0, 30) : null,
        role: 'STUDENT',
      },
    });

    // The code could not be sent: remove the half-made account so the person can simply try again
    if (!(await sendEmailOtp(user))) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      return res.status(503).json({ success: false, message: 'We could not send the verification code to this email. Check the address and try again.' });
    }

    await logAudit({ userId: user.id, action: 'USER_CREATED', targetId: user.id, targetType: 'user', details: { method: 'self_signup' }, req });

    return res.status(201).json({
      success: true,
      message: `Account created. We sent a 6-digit code to ${maskEmail(user.email)}.`,
      data: { otpRequired: true, otpToken: signOtpToken(user.id), email: maskEmail(user.email) },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

// Issues the session for a fully authenticated user. Learners get a new session id, which signs out their other device.
const completeLogin = async (req, res, user, status = 200) => {
  const sid = user.role === 'STUDENT' ? crypto.randomUUID() : undefined;
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date(), ...(sid && { activeSessionId: sid }) } });

  const { accessToken, refreshToken } = generateTokens(user.id, user.role, sid);
  setRefreshCookie(res, refreshToken);

  await logAudit({ userId: user.id, action: 'LOGIN', details: { success: true }, req });

  return res.status(status).json({
    success: true,
    message: 'Login successful.',
    data: { user: { ...publicUser(user), learnerType: await learnerType(user) }, accessToken },
  });
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

    // Individual learners confirm their email with a one-time code first
    if (await needsEmailOtp(user)) return requireEmailOtp(res, user);

    return completeLogin(req, res, user);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

// POST /api/auth/verify-otp { otpToken, otp } — second login step for individual learners
const verifyEmailOtp = async (req, res) => {
  try {
    const userId = readOtpToken(req.body.otpToken);
    const user = userId && await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return res.status(400).json({ success: false, code: 'OTP_SESSION_EXPIRED', message: 'Your verification session expired. Please sign in again.' });
    }
    if (user.isEmailVerified) return completeLogin(req, res, user);

    if (!user.emailVerifyExpiry || user.emailVerifyExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'This code has expired. Request a new one.' });
    }
    if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many incorrect codes. Request a new one.' });
    }

    const otp = String(req.body.otp || '').replace(/\D/g, '');
    if (otp.length !== 6 || otpHash(user.id, otp) !== user.emailVerifyToken) {
      const { emailOtpAttempts } = await prisma.user.update({
        where: { id: user.id },
        data: { emailOtpAttempts: { increment: 1 } },
        select: { emailOtpAttempts: true },
      });
      const left = Math.max(0, OTP_MAX_ATTEMPTS - emailOtpAttempts);
      return res.status(400).json({
        success: false,
        message: left ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect codes. Request a new one.',
      });
    }

    const verified = await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null, emailOtpAttempts: 0 },
    });
    await logAudit({ userId: user.id, action: 'ACTIVITY', details: { event: 'EMAIL_VERIFIED', method: 'otp' }, req });
    const { subject, html } = emailTemplates.welcome(user.firstName);
    sendEmail({ to: user.email, subject, html });

    return completeLogin(req, res, verified);
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify the code.' });
  }
};

// POST /api/auth/resend-otp { otpToken }
const resendEmailOtp = async (req, res) => {
  try {
    const userId = readOtpToken(req.body.otpToken);
    const user = userId && await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.isEmailVerified) {
      return res.status(400).json({ success: false, code: 'OTP_SESSION_EXPIRED', message: 'Your verification session expired. Please sign in again.' });
    }
    const sentAt = user.emailVerifyExpiry ? user.emailVerifyExpiry.getTime() - OTP_TTL_MS : 0;
    if (Date.now() - sentAt < OTP_RESEND_GAP_MS) {
      return res.status(429).json({ success: false, message: 'Please wait a minute before requesting another code.' });
    }
    return requireEmailOtp(res, user);
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send a new code.' });
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
      select: { id: true, role: true, isActive: true, passwordChangedAt: true, activeSessionId: true },
    });

    if (!user || !user.isActive || issuedBeforePasswordChange(decoded, user.passwordChangedAt)) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }

    if (sessionReplaced(user, decoded)) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, code: 'SESSION_REPLACED', message: 'You signed in on another device, so this session was ended.' });
    }

    // Rotate: revoke the old token, issue a new pair
    await prisma.revokedToken.upsert({
      where: { tokenHash },
      create: { userId: user.id, tokenHash, expiresAt: new Date(decoded.exp * 1000) },
      update: {},
    });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role, decoded.sid);
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
          // Frees the learner's session slot (only if this device still holds it)
          if (decoded?.sid) {
            await prisma.user.updateMany({ where: { id: userId, activeSessionId: decoded.sid }, data: { activeSessionId: null } });
          }
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
    res.json({ success: true, data: { ...user, learnerType: await learnerType(user) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

// PUT /api/auth/me
// Learners cannot change their own details: school learners ask their school, individual learners contact support
const learnerEditBlocked = async (req, res) => {
  if (req.user.role !== 'STUDENT') return false;
  const school = await isSchoolLearner(req.user.id);
  res.status(403).json({
    success: false,
    code: 'PROFILE_LOCKED',
    message: school
      ? 'Your details are managed by your school. Ask your teacher to update them.'
      : 'To change your details, email us or message the team from Support Chat.',
  });
  return true;
};

const updateProfile = async (req, res) => {
  try {
    if (await learnerEditBlocked(req, res)) return;
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

    // School learners' passwords are reset by their teacher (except the forced first change)
    if (user.role === 'STUDENT' && !user.mustChangePassword && await isSchoolLearner(user.id)) {
      return res.status(403).json({ success: false, code: 'PROFILE_LOCKED', message: 'Your password is managed by your school. Ask your teacher to reset it.' });
    }

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
    const { accessToken, refreshToken } = generateTokens(user.id, user.role, req.sessionId);
    setRefreshCookie(res, refreshToken);

    res.json({ success: true, message: 'Password changed successfully. Other devices have been signed out.', data: { accessToken } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

module.exports = {
  register, login, refreshToken, logout,
  verifyEmailOtp, resendEmailOtp,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  getMe, updateProfile, changePassword, learnerEditBlocked,
  hashToken, issuedBeforePasswordChange, sessionReplaced, REFRESH_COOKIE,
};
