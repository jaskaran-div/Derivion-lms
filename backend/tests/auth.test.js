const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { beforeEach, describe, it } = require('node:test');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { installMockModule, response } = require('./helpers/mocks');

process.env.JWT_SECRET = 'access_secret';
process.env.JWT_REFRESH_SECRET = 'refresh_secret';

const db = {};
let storedSettings = {};
const reset = async () => {
  db.users = [{
    id: 'u1', email: 'a@example.com', username: null, firstName: 'A', lastName: 'B', role: 'STUDENT',
    isActive: true, avatar: null, mustChangePassword: false, passwordChangedAt: null,
    password: await bcrypt.hash('old-password', 4), isEmailVerified: false, emailVerifyToken: null,
    resetPasswordToken: null, resetPasswordExpiry: null,
  }];
  db.revoked = [];
  storedSettings = {};
};

const pick = (obj, select) => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k] === true).map((k) => [k, obj[k]])) : obj);
const prisma = {
  user: {
    findUnique: async ({ where, select }) => { const u = db.users.find((x) => x.id === where.id || x.email === where.email); return u ? pick(u, select) : null; },
    findFirst: async ({ where }) => db.users.find((u) => {
      // isSchoolLearner: { id, role, OR: [school links…] }
      if (where.id && where.role) return u.id === where.id && u.role === where.role && Boolean(u.createdById || u.schoolId);
      if (where.OR) return where.OR.some((c) => (c.email && u.email.toLowerCase() === c.email.equals.toLowerCase()) || (c.username && u.username === c.username.equals));
      if (where.resetPasswordToken) return u.resetPasswordToken === where.resetPasswordToken && u.resetPasswordExpiry > where.resetPasswordExpiry.gt;
      return false;
    }) || null,
    update: async ({ where, data }) => Object.assign(db.users.find((u) => u.id === where.id), data),
  },
  revokedToken: {
    findUnique: async ({ where }) => db.revoked.find((r) => r.tokenHash === where.tokenHash) || null,
    upsert: async ({ create }) => { db.revoked.push(create); return create; },
  },
  siteSettings: { findMany: async () => Object.entries(storedSettings).map(([key, value]) => ({ key, value: JSON.stringify(value) })) },
  auditLog: { create: async () => ({}) },
};

installMockModule(require.resolve('../src/config/database'), prisma);
// The last emailed one-time code, captured from the OTP email template
let lastOtp = null;
installMockModule(require.resolve('../src/config/email'), {
  sendEmail: async () => true,
  emailConfigured: () => true,
  emailTemplates: new Proxy({}, {
    get: (_, name) => (...args) => {
      if (name === 'emailOtp') lastOtp = args[1];
      return { subject: 's', html: 'h' };
    },
  }),
});

const { authenticate } = require('../src/middleware/auth');
const auth = require('../src/controllers/authController');
const cache = require('../src/config/cache');

const runAuth = async (token, url = '/api/courses') => {
  const res = response();
  let passed = false;
  await authenticate({ headers: { authorization: `Bearer ${token}` }, originalUrl: url }, res, () => { passed = true; });
  return { res, passed };
};

describe('sessions and passwords', () => {
  beforeEach(async () => { await reset(); await cache.del('settings:all'); });

  it('rejects access tokens issued before the last password change', async () => {
    const token = jwt.sign({ userId: 'u1', role: 'STUDENT', iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET);
    db.users[0].passwordChangedAt = new Date();
    const { res, passed } = await runAuth(token);
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'SESSION_EXPIRED');
  });

  it('accepts tokens issued after the password change', async () => {
    db.users[0].passwordChangedAt = new Date(Date.now() - 60000);
    const token = jwt.sign({ userId: 'u1', role: 'STUDENT' }, process.env.JWT_SECRET);
    const { passed } = await runAuth(token);
    assert.equal(passed, true);
  });

  it('blocks everything except changing the password while a one-time password is active', async () => {
    db.users[0].mustChangePassword = true;
    const token = jwt.sign({ userId: 'u1', role: 'STUDENT' }, process.env.JWT_SECRET);
    const blocked = await runAuth(token, '/api/student/dashboard');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.body.code, 'MUST_CHANGE_PASSWORD');
    const allowed = await runAuth(token, '/api/auth/change-password');
    assert.equal(allowed.passed, true);
  });

  it('stores reset tokens hashed and signs out every session on reset', async () => {
    const res = response();
    await auth.forgotPassword({ body: { email: 'a@example.com' } }, res);
    const stored = db.users[0].resetPasswordToken;
    assert.match(stored, /^[0-9a-f]{64}$/);

    // The raw token (only in the email) is needed; the stored hash itself must not work
    const bad = response();
    await auth.resetPassword({ body: { token: stored, password: 'new-password-1' }, ip: '::1', headers: {} }, bad);
    assert.equal(bad.statusCode, 400);

    const raw = crypto.randomBytes(32).toString('hex');
    db.users[0].resetPasswordToken = auth.hashToken(raw);
    const ok = response();
    await auth.resetPassword({ body: { token: raw, password: 'new-password-1' }, ip: '::1', headers: {} }, ok);
    assert.equal(ok.statusCode, 200);
    assert.ok(db.users[0].passwordChangedAt instanceof Date);
    assert.equal(db.users[0].resetPasswordToken, null);
  });

  it('rotates the refresh cookie and refuses a reused refresh token', async () => {
    const refresh = jwt.sign({ userId: 'u1' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const first = response();
    await auth.refreshToken({ cookies: { [auth.REFRESH_COOKIE]: refresh } }, first);
    assert.equal(first.statusCode, 200);
    assert.ok(first.body.data.accessToken);
    assert.ok(first.cookies[auth.REFRESH_COOKIE]);

    const replay = response();
    await auth.refreshToken({ cookies: { [auth.REFRESH_COOKIE]: refresh } }, replay);
    assert.equal(replay.statusCode, 401);
  });

  const login = async () => {
    const res = response();
    await auth.login({ body: { email: 'a@example.com', password: 'old-password' }, ip: '::1', headers: {} }, res);
    return res;
  };

  it('asks individual learners for an emailed code before their first sign-in', async () => {
    const first = await login();
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.data.otpRequired, true);
    assert.equal(first.body.data.accessToken, undefined);
    assert.match(lastOtp, /^\d{6}$/);

    const wrong = response();
    await auth.verifyEmailOtp({ body: { otpToken: first.body.data.otpToken, otp: lastOtp === '000000' ? '111111' : '000000' }, ip: '::1', headers: {} }, wrong);
    assert.equal(wrong.statusCode, 400);

    const ok = response();
    await auth.verifyEmailOtp({ body: { otpToken: first.body.data.otpToken, otp: lastOtp }, ip: '::1', headers: {} }, ok);
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.body.data.accessToken);
    assert.equal(db.users[0].isEmailVerified, true);

    // Verified once: later sign-ins go straight through
    const again = await login();
    assert.ok(again.body.data.accessToken);
  });

  it('never asks school learners for an email code', async () => {
    db.users[0].createdById = 'teacher-1';
    const res = await login();
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.learnerType, 'SCHOOL');
  });

  it('keeps a learner signed in on one device only', async () => {
    db.users[0].createdById = 'teacher-1';
    const deviceA = await login();
    const deviceB = await login();

    const a = await runAuth(deviceA.body.data.accessToken);
    assert.equal(a.passed, false);
    assert.equal(a.res.statusCode, 401);
    assert.equal(a.res.body.code, 'SESSION_REPLACED');
    assert.equal((await runAuth(deviceB.body.data.accessToken)).passed, true);

    // Device A cannot get new tokens with its refresh cookie either
    const refresh = response();
    await auth.refreshToken({ cookies: { [auth.REFRESH_COOKIE]: deviceA.cookies[auth.REFRESH_COOKIE] } }, refresh);
    assert.equal(refresh.statusCode, 401);
    assert.equal(refresh.body.code, 'SESSION_REPLACED');
  });

  it('does not let learners edit their own profile', async () => {
    const res = response();
    await auth.updateProfile({ user: { id: 'u1', role: 'STUDENT' }, body: { firstName: 'X' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'PROFILE_LOCKED');
    assert.equal(db.users[0].firstName, 'A');
  });
});
