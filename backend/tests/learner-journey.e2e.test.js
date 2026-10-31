/**
 * End-to-end learner journey: LMS (real controllers + real PostgreSQL) <-> Operations (real server + worker processes).
 *
 * Opt-in, because it needs two local databases and the Operations repository checked out next to this one:
 *   LMS_TEST_DATABASE_URL   a MIGRATED, DISPOSABLE local LMS database  (refused unless the host is localhost)
 *   OPS_TEST_ADMIN_URL      a local PostgreSQL URL allowed to CREATE DATABASE (a throw-away Operations database is made)
 *   OPERATIONS_REPO         path to the Operations repo (default ../../../isft-operations)
 * Without these the whole file is skipped, so CI and normal `npm test` runs are unaffected.
 * Only the email provider is faked (it records exactly what would be sent); everything else is real.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const LMS_DB = process.env.LMS_TEST_DATABASE_URL;
const OPS_ADMIN = process.env.OPS_TEST_ADMIN_URL;
const OPS_REPO = process.env.OPERATIONS_REPO || path.resolve(__dirname, '../../../isft-operations');
const OPS_BACKEND = path.join(OPS_REPO, 'backend');

const skipReason = !LMS_DB || !OPS_ADMIN
  ? 'set LMS_TEST_DATABASE_URL and OPS_TEST_ADMIN_URL to run the end-to-end journey'
  : !fs.existsSync(path.join(OPS_BACKEND, 'server.js')) ? `Operations repo not found at ${OPS_REPO}` : false;

// Safety: never let this file touch anything but a local database
if (!skipReason) {
  for (const url of [LMS_DB, OPS_ADMIN]) {
    const host = new URL(url).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`Refusing to run against non-local database host "${host}"`);
  }
}

const { installMockModule, response } = require('./helpers/mocks');
const SECRET = 'lms-shared-secret-'.padEnd(48, 'k');

describe('learner journey LMS <-> Operations', { skip: skipReason }, () => {
  // -------------------------------------------------------------------------- environment & modules
  let prisma, auth, payments, emailService, outboxWorker, integration, lifecycle;
  let opsUrl, opsDbUrl, opsDbName, lmsServer, lmsPort, opsPort;
  const children = {};
  const mail = { sent: [], failuresLeft: 0, calls: 0 };
  let otpSeen;
  let lastOtp;

  const freePort = () => new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
  const until = async (fn, { timeout = 20000, interval = 150, label = 'condition' } = {}) => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
      await new Promise((r) => setTimeout(r, interval));
    }
  };
  const uid = () => crypto.randomBytes(4).toString('hex');

  const opsEnv = () => ({
    ...process.env,
    NODE_ENV: 'development', PORT: String(opsPort), HOST: '127.0.0.1',
    JWT_SECRET: 'ops-jwt-secret-'.padEnd(48, 'j'), FRONTEND_URL: 'http://localhost:5173',
    DATABASE_URL: opsDbUrl, LMS_INTEGRATION_SECRET: SECRET, LMS_API_URL: `http://127.0.0.1:${lmsPort}`,
    WORKER_INTERVAL_MS: '300', ONBOARDING_TOKEN_TTL_DAYS: '30',
  });
  const startOps = async () => {
    children.ops = spawn(process.execPath, ['server.js'], { cwd: OPS_BACKEND, env: opsEnv(), stdio: 'ignore' });
    await until(async () => { try { return (await fetch(`${opsUrl}/api/health`)).ok; } catch { return false; } }, { label: 'Operations API' });
  };
  const stopOps = async () => {
    if (!children.ops) return;
    children.ops.kill();
    await new Promise((r) => children.ops.once('exit', r));
    children.ops = null;
  };
  const opsQuery = async (sql, params = []) => {
    const { Client } = require('pg');
    const c = new Client({ connectionString: opsDbUrl });
    await c.connect();
    try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
  };

  before(async () => {
    process.env.DATABASE_URL = LMS_DB;
    process.env.DIRECT_URL = LMS_DB;
    Object.assign(process.env, {
      NODE_ENV: 'test', JWT_SECRET: 'lms-jwt-'.padEnd(48, 'a'), JWT_REFRESH_SECRET: 'lms-refresh-'.padEnd(48, 'b'),
      RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'rzp_secret', RAZORPAY_WEBHOOK_SECRET: 'webhook_secret',
      APP_NAME: 'Derivion Learning Hub', ADMIN_EMAIL: 'support@derivion.test',
      LMS_INTEGRATION_SECRET: SECRET, ONBOARDING_TOKEN_SECRET: 'onboarding-token-secret-'.padEnd(48, 't'),
      OPERATIONS_PUBLIC_URL: 'https://operations.derivion.test', ONBOARDING_TOKEN_TTL_DAYS: '30',
    });
    delete process.env.REDIS_URL;

    // One quiet Prisma client against the disposable database (config/database reuses global.prisma outside production)
    const { PrismaClient } = require('@prisma/client');
    global.prisma = new PrismaClient({ datasources: { db: { url: LMS_DB } } });
    prisma = global.prisma;

    // The database is disposable: start from empty queues and no users, so leftovers from an earlier run cannot be replayed
    // into this one (or look like learners nobody has announced yet)
    await prisma.$executeRaw`TRUNCATE TABLE outbox_events, email_logs, inbound_events, integration_nonces, users, categories CASCADE`;

    // Only email is faked: capture the OTP the registration flow would send
    installMockModule(require.resolve('../src/config/email'), {
      emailConfigured: () => true,
      sendEmail: async ({ html }) => { otpSeen = (String(html).match(/\d{6}/) || [])[0]; return true; },
      emailTemplates: {
        emailOtp: (name, otp) => ({ subject: 'code', html: `Your code is ${otp}` }),
        welcome: () => ({ subject: 'welcome', html: 'welcome' }),
        enrollmentConfirmation: () => ({ subject: 'legacy enrollment email', html: 'legacy' }),
        notification: () => ({ subject: 'n', html: 'n' }),
        emailVerification: () => ({ subject: 'v', html: 'v' }),
        passwordReset: () => ({ subject: 'p', html: 'p' }),
      },
    });

    auth = require('../src/controllers/authController');
    payments = require('../src/controllers/paymentController');
    emailService = require('../src/services/emailService');
    outboxWorker = require('../src/workers/outboxWorker');
    integration = require('../src/controllers/integrationController');
    lifecycle = require('../src/services/lifecycle');

    emailService.setProvider({
      name: 'fake',
      send: async (message) => {
        mail.calls += 1;
        if (mail.failuresLeft > 0) { mail.failuresLeft -= 1; throw new Error('SMTP 421 service unavailable'); }
        mail.sent.push(message);
        return { messageId: message.messageId };
      },
    });

    // Disposable Operations database + schema
    const { Client } = require('pg');
    opsDbName = `ops_e2e_${uid()}`;
    const admin = new Client({ connectionString: OPS_ADMIN });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${opsDbName}`);
    await admin.end();
    const u = new URL(OPS_ADMIN);
    u.pathname = `/${opsDbName}`;
    opsDbUrl = u.toString();
    lmsPort = await freePort();
    opsPort = await freePort();
    opsUrl = `http://127.0.0.1:${opsPort}`;
    process.env.OPERATIONS_API_URL = opsUrl;

    const mig = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: OPS_BACKEND, env: opsEnv(), encoding: 'utf8' });
    assert.equal(mig.status, 0, mig.stderr || mig.stdout);

    // The LMS endpoint that Operations calls back (same controller + the same raw-body capture as server.js)
    const express = require('express');
    const app = express();
    app.use(express.json({ verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/integrations/')) req.rawBody = buf; } }));
    app.post('/api/integrations/operations/events', integration.authenticate, integration.receiveEvent);
    app.get('/api/integrations/operations/ping', integration.authenticate, integration.ping);
    app.post('/api/integrations/operations/emails/:id/retry', integration.authenticate, integration.retryEmail);
    await new Promise((r) => { lmsServer = app.listen(lmsPort, '127.0.0.1', r); });

    await startOps();
    children.worker = spawn(process.execPath, ['worker.js'], { cwd: OPS_BACKEND, env: opsEnv(), stdio: 'ignore' });
  });

  after(async () => {
    for (const c of Object.values(children)) { if (c) c.kill(); }
    await new Promise((r) => setTimeout(r, 300));
    if (lmsServer) lmsServer.close();
    if (prisma) await prisma.$disconnect();
    if (OPS_ADMIN && opsDbName) {
      const { Client } = require('pg');
      const admin = new Client({ connectionString: OPS_ADMIN });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${opsDbName} WITH (FORCE)`);
      await admin.end();
    }
  });

  // -------------------------------------------------------------------------- helpers driving the real controllers
  const runOutbox = async (rounds = 3) => {
    const total = { sent: 0, retry: 0, dead: 0 };
    for (let i = 0; i < rounds; i += 1) {
      const s = await outboxWorker.processBatch({ limit: 50 });
      total.sent += s.sent; total.retry += s.retry; total.dead += s.dead;
    }
    return total;
  };

  const registerAndVerify = async (overrides = {}) => {
    const email = `learner-${uid()}@journey.test`;
    const body = { email, password: 'Correct-Horse-9', firstName: 'Asha', lastName: 'Verma', phone: '+91 98765 43210', ...overrides };
    const reg = response();
    await auth.register({ body, ip: '::1', headers: {} }, reg);
    assert.equal(reg.statusCode, 201, JSON.stringify(reg.body));
    const ok = response();
    await auth.verifyEmailOtp({ body: { otpToken: reg.body.data.otpToken, otp: otpSeen }, ip: '::1', headers: {} }, ok);
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    lastOtp = { otpToken: reg.body.data.otpToken, otp: otpSeen };
    return prisma.user.findUnique({ where: { email: body.email } });
  };

  let category;
  const makeCourse = async (title) => {
    category = category || await prisma.category.create({ data: { name: `Cat ${uid()}`, slug: `cat-${uid()}` } });
    return prisma.course.create({
      data: { title, slug: `c-${uid()}`, description: `${title} description`, price: 4999, status: 'PUBLISHED', categoryId: category.id, level: 'Beginner', totalLessons: 12 },
    });
  };

  const buy = async (user, course, { deliveries = 1, concurrent = false } = {}) => {
    const orderId = `order_${uid()}${uid()}`;
    const rzpPaymentId = `pay_${uid()}${uid()}`;
    const payment = await prisma.payment.create({
      data: { userId: user.id, courseId: course.id, amount: 4999, status: 'PENDING', razorpayOrderId: orderId },
    });
    const raw = Buffer.from(JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: rzpPaymentId, order_id: orderId, amount: 499900 } } },
    }));
    const signature = crypto.createHmac('sha256', 'webhook_secret').update(raw).digest('hex');
    const deliver = async () => {
      const res = response();
      await payments.webhook({ headers: { 'x-razorpay-signature': signature }, body: raw }, res);
      return res;
    };
    const results = concurrent ? await Promise.all(Array.from({ length: deliveries }, deliver)) : [];
    if (!concurrent) for (let i = 0; i < deliveries; i += 1) results.push(await deliver());
    results.forEach((r) => assert.equal(r.statusCode, 200));
    return { payment, rzpPaymentId, orderId };
  };

  // Razorpay webhook helper for events other than capture
  const razorpayEvent = async (event, entity, extra = {}) => {
    const raw = Buffer.from(JSON.stringify({ event, payload: { payment: { entity }, ...extra } }));
    const signature = crypto.createHmac('sha256', 'webhook_secret').update(raw).digest('hex');
    const res = response();
    await payments.webhook({ headers: { 'x-razorpay-signature': signature }, body: raw }, res);
    assert.equal(res.statusCode, 200);
  };
  const newPendingPayment = (user, course) => prisma.payment.create({
    data: { userId: user.id, courseId: course.id, amount: 4999, status: 'PENDING', razorpayOrderId: `order_${uid()}${uid()}` },
  });
  const flush = async () => {
    await runOutbox();
    for (let i = 0; i < 10; i += 1) {
      const r = await emailService.processBatch({ limit: 50 });
      if (!r.sent && !r.retry && !r.failed) break;
    }
    await runOutbox();
  };
  const mailsTo = (to, template) => mail.sent.filter((m) => m.to === to && (!template || m.subject.includes(template)));

  const tokenFromLastMail = (to) => {
    // the newest email to this address that carries a personal onboarding link
    const msg = [...mail.sent].reverse().find((x) => x.to === to && /operations\.derivion\.test\/onboarding\/[a-f0-9]{64}/.test(x.html));
    assert.ok(msg, `no onboarding email sent to ${to}`);
    const m = msg.html.match(/https:\/\/operations\.derivion\.test\/onboarding\/([a-f0-9]{64})/);
    assert.ok(m, 'onboarding link missing from the email');
    return { token: m[1], msg };
  };

  const opsGet = async (token) => (await fetch(`${opsUrl}/api/onboarding/${token}`)).json();
  const opsFillAndSubmit = async (token, fields) => {
    const h = { 'Content-Type': 'application/json' };
    await fetch(`${opsUrl}/api/onboarding/${token}`, { method: 'PUT', headers: h, body: JSON.stringify(fields) });
    return fetch(`${opsUrl}/api/onboarding/${token}/submit`, { method: 'POST', headers: h, body: JSON.stringify(fields) });
  };
  const formFields = (user, extra = {}) => ({
    full_name: `${user.firstName} ${user.lastName}`, mobile: '9876543210', email: user.email, date_of_birth: '1995-04-02', gender: 'Female',
    city: 'Pune', state: 'Maharashtra', pin_code: '411001', highest_qualification: 'MBA', institution: 'Pune University',
    emergency_name: 'Parent', emergency_mobile: '9876500000', declaration_confirmed: true, student_name: `${user.firstName} ${user.lastName}`,
    place: 'Pune', learning_objective: 'Learn to trade responsibly', ...extra,
  });

  // -------------------------------------------------------------------------- the journey
  const state = {};

  it('1. OTP verification queues learner.verified atomically, and syncs the learner to Operations', async () => {
    state.user = await registerAndVerify();
    const ev = await prisma.outboxEvent.findUnique({ where: { eventId: `learner.verified:${state.user.id}` } });
    assert.ok(ev, 'outbox row written in the verification transaction');
    assert.equal(ev.status, 'PENDING');
    assert.equal(ev.payload.email, state.user.email);

    await runOutbox();
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'SENT');
    const rows = await opsQuery('SELECT * FROM learners WHERE lms_user_id = $1', [state.user.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].first_name, 'Asha');
    assert.equal(rows[0].email, state.user.email);
    assert.equal(rows[0].phone, '+91 98765 43210');
    assert.equal(rows[0].onboarding_status, 'REGISTERED');
    assert.ok(rows[0].email_verified_at);
  });

  it('1b. verifying again never queues a second learner event', async () => {
    const otp = lastOtp;   // belongs to state.user (the last registration so far)
    const res = response();
    await auth.verifyEmailOtp({ body: otp, ip: '::1', headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(await prisma.outboxEvent.count({ where: { eventId: `learner.verified:${state.user.id}` } }), 1);
  });

  it('3. a verified Razorpay payment creates enrollment, invoice, onboarding token, sync event and email in one go', async () => {
    state.courseA = await makeCourse('Introduction to Finance');
    state.buyA = await buy(state.user, state.courseA);

    const payment = await prisma.payment.findUnique({ where: { id: state.buyA.payment.id } });
    assert.equal(payment.status, 'SUCCESS');
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: state.user.id, courseId: state.courseA.id } } });
    assert.equal(enrollment.status, 'ACTIVE');
    assert.equal(enrollment.onboardingStatus, 'ONBOARDING_PENDING');
    state.enrollmentA = enrollment;

    const invoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } });
    assert.match(invoice.invoiceNumber, /^INV-\d{4}-\d{5}$/);
    assert.equal(Number(invoice.amount), 4999);
    assert.equal(invoice.learnerEmail, state.user.email);

    const tokens = await prisma.onboardingToken.findMany({ where: { enrollmentId: enrollment.id } });
    assert.equal(tokens.length, 1);
    assert.match(tokens[0].tokenHash, /^[a-f0-9]{64}$/);
    assert.ok(tokens[0].expiresAt > new Date());

    const ev = await prisma.outboxEvent.findUnique({ where: { eventId: `payment.successful:${payment.id}` } });
    assert.equal(ev.payload.lms_enrollment_id, enrollment.id);
    assert.equal(ev.payload.onboarding_token_hash, tokens[0].tokenHash);
    assert.equal(ev.payload.invoice_number, invoice.invoiceNumber);

    const log = await prisma.emailLog.findUnique({ where: { dedupeKey: `purchase-onboarding:${payment.id}` } });
    assert.equal(log.status, 'PENDING');
    assert.equal(log.toEmail, state.user.email);
    assert.ok(!JSON.stringify(log.data).match(/[a-f0-9]{64}/), 'the raw onboarding token is not stored with the email job');
  });

  it('4. the onboarding email carries course, payment, invoice PDF and the personal Operations link', async () => {
    const s = await emailService.processBatch();
    assert.equal(s.sent, 1);
    const { token, msg } = tokenFromLastMail(state.user.email);
    state.tokenA = token;

    assert.match(msg.subject, /Introduction to Finance/);
    for (const text of ['Introduction to Finance', 'Beginner', '12 lessons', state.enrollmentA.id, '4,999.00', 'Paid', state.buyA.rzpPaymentId, 'Asha']) {
      assert.ok(msg.html.includes(text), `email should mention "${text}"`);
    }
    const invoice = await prisma.invoice.findUnique({ where: { paymentId: state.buyA.payment.id } });
    assert.ok(msg.html.includes(invoice.invoiceNumber));
    assert.equal(msg.attachments.length, 1);
    assert.equal(msg.attachments[0].filename, `${invoice.invoiceNumber}.pdf`);
    assert.equal(msg.attachments[0].content.subarray(0, 5).toString(), '%PDF-');
    assert.ok(msg.attachments[0].content.length > 1500);

    // the link's token is exactly the one whose hash was stored and sent to Operations
    const stored = await prisma.onboardingToken.findFirst({ where: { enrollmentId: state.enrollmentA.id } });
    assert.equal(crypto.createHash('sha256').update(token).digest('hex'), stored.tokenHash);

    const log = await prisma.emailLog.findUnique({ where: { dedupeKey: `purchase-onboarding:${state.buyA.payment.id}` } });
    assert.equal(log.status, 'SENT');
    assert.ok(log.sentAt && log.providerMessageId);
    assert.equal(mail.sent.filter((m) => m.to === state.user.email).length, 1);
  });

  it('3b/5. the enrollment reaches Operations on the existing learner, and the link opens a prefilled form', async () => {
    await runOutbox();
    const learners = await opsQuery('SELECT id FROM learners WHERE lms_user_id = $1', [state.user.id]);
    assert.equal(learners.length, 1, 'still exactly one learner');
    const enr = await opsQuery('SELECT * FROM enrollments WHERE lms_enrollment_id = $1', [state.enrollmentA.id]);
    assert.equal(enr.length, 1);
    assert.equal(enr[0].learner_id, learners[0].id);
    assert.equal(enr[0].payment_status, 'PAID');
    assert.equal(enr[0].course_name, 'Introduction to Finance');
    assert.equal(Number(enr[0].amount_paid), 4999);

    const view = await opsGet(state.tokenA);
    assert.equal(view.enrollment.programme, 'Introduction to Finance');
    assert.equal(view.enrollment.full_name, 'Asha Verma');
    assert.equal(view.enrollment.email, state.user.email);
    assert.equal(view.enrollment.mobile, '+91 98765 43210');
    assert.equal(view.onboarding.mode, 'full');
  });

  it('6/7. submitting the form updates the same learner, then Operations tells the LMS (authenticated) and the LMS status changes', async () => {
    const res = await opsFillAndSubmit(state.tokenA, formFields(state.user));
    assert.equal(res.status, 200);

    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [state.user.id]))[0].n, 1);
    const enr = (await opsQuery('SELECT * FROM enrollments WHERE lms_enrollment_id = $1', [state.enrollmentA.id]))[0];
    assert.equal(enr.onboarding_status, 'ONBOARDING_COMPLETED');
    const learner = (await opsQuery('SELECT * FROM learners WHERE lms_user_id = $1', [state.user.id]))[0];
    assert.equal(learner.onboarding_status, 'ONBOARDING_COMPLETED');
    assert.equal(learner.learner_profile.city, 'Pune');

    // The Operations worker delivers onboarding.completed to the LMS
    const done = await until(async () => {
      const e = await prisma.enrollment.findUnique({ where: { id: state.enrollmentA.id } });
      return e.onboardingStatus === 'ONBOARDING_COMPLETED' ? e : null;
    }, { label: 'LMS onboarding status' });
    assert.ok(done.onboardingCompletedAt);
    const tok = await prisma.onboardingToken.findFirst({ where: { enrollmentId: state.enrollmentA.id } });
    assert.ok(tok.usedAt, 'link is marked used in the LMS');
    assert.equal(await prisma.inboundEvent.count({ where: { eventId: `onboarding.completed:${state.enrollmentA.id}` } }), 1);
    const sentRow = (await opsQuery("SELECT status, attempts FROM outbound_events WHERE event_id = $1", [`onboarding.completed:${state.enrollmentA.id}`]))[0];
    assert.equal(sentRow.status, 'SENT');

    // The one-time link cannot be used again
    const again = await opsFillAndSubmit(state.tokenA, formFields(state.user));
    assert.equal(again.status, 400);
  });

  it('2/10. a second course updates the same learner, adds a separate enrollment, and only asks what is new', async () => {
    state.courseB = await makeCourse('Options Trading Masterclass');
    state.buyB = await buy(state.user, state.courseB);
    await emailService.processBatch();
    await runOutbox();

    assert.equal(await prisma.enrollment.count({ where: { userId: state.user.id } }), 2);
    assert.equal(await prisma.invoice.count({ where: { userId: state.user.id } }), 2);
    const invoices = await prisma.invoice.findMany({ where: { userId: state.user.id } });
    assert.equal(new Set(invoices.map((i) => i.invoiceNumber)).size, 2, 'distinct invoice numbers');

    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [state.user.id]))[0].n, 1);
    const enrollments = await opsQuery('SELECT e.* FROM enrollments e JOIN learners l ON l.id = e.learner_id WHERE l.lms_user_id = $1 ORDER BY e.id', [state.user.id]);
    assert.equal(enrollments.length, 2);

    const { token, msg } = tokenFromLastMail(state.user.email);
    state.tokenB = token;
    assert.notEqual(token, state.tokenA);
    assert.match(msg.subject, /Options Trading Masterclass/);
    assert.ok(msg.html.includes('We already have your details'), 'returning learners get the short-form wording');

    const view = await opsGet(token);
    assert.equal(view.onboarding.mode, 'returning');
    assert.equal(view.enrollment.city, 'Pune');
    assert.equal(view.enrollment.highest_qualification, 'MBA');
    assert.ok(!view.enrollment.learning_objective, 'the course-specific question is asked again');

    const res = await opsFillAndSubmit(token, formFields(state.user, { learning_objective: 'Master options strategies' }));
    assert.equal(res.status, 200);
    await until(async () => (await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: state.user.id, courseId: state.courseB.id } },
    })).onboardingStatus === 'ONBOARDING_COMPLETED', { label: 'second LMS onboarding status' });
    // the first enrollment is untouched
    const first = (await opsQuery('SELECT learning_objective FROM enrollments WHERE lms_enrollment_id = $1', [state.enrollmentA.id]))[0];
    assert.equal(first.learning_objective, 'Learn to trade responsibly');
  });

  it('8. duplicate webhooks (sequential and concurrent) create exactly one of everything', async () => {
    const user = await registerAndVerify();
    const course = await makeCourse('Duplicate Safety Course');
    const { payment } = await buy(user, course, { deliveries: 4, concurrent: true });

    assert.equal(await prisma.invoice.count({ where: { paymentId: payment.id } }), 1);
    assert.equal(await prisma.emailLog.count({ where: { dedupeKey: `purchase-onboarding:${payment.id}` } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { eventId: `payment.successful:${payment.id}` } }), 1);
    const enr = await prisma.enrollment.findMany({ where: { userId: user.id, courseId: course.id } });
    assert.equal(enr.length, 1);
    assert.equal(await prisma.onboardingToken.count({ where: { enrollmentId: enr[0].id } }), 1);
    assert.equal((await prisma.course.findUnique({ where: { id: course.id } })).totalStudents, 1);
    state.dupUser = user; state.dupPayment = payment;
  });

  it('8b. redelivering already-delivered events (outbox replay) changes nothing in Operations and sends no second email', async () => {
    await emailService.processBatch();
    await runOutbox();
    const snapshot = async () => ({
      learners: (await opsQuery('SELECT COUNT(*)::int AS n FROM learners'))[0].n,
      enrollments: (await opsQuery('SELECT COUNT(*)::int AS n FROM enrollments'))[0].n,
      tokens: (await opsQuery('SELECT COUNT(*)::int AS n FROM onboarding_tokens'))[0].n,
      emails: mail.sent.length,
    });
    const before = await snapshot();

    await prisma.$executeRaw`UPDATE outbox_events SET status = 'PENDING'::"OutboxStatus", "nextAttemptAt" = (now() AT TIME ZONE 'UTC'), attempts = 0 WHERE status = 'SENT'::"OutboxStatus"`;
    const replay = await runOutbox();
    assert.ok(replay.sent > 0, 'events were redelivered');
    await emailService.processBatch();
    assert.deepEqual(await snapshot(), before);
  });

  it('2 (outage). Operations down during registration: the LMS keeps the event and delivers it after recovery', async () => {
    await stopOps();
    const user = await registerAndVerify();
    const eventId = `learner.verified:${user.id}`;

    const down = await runOutbox(1);
    assert.equal(down.sent, 0);
    assert.ok(down.retry >= 1);
    let ev = await prisma.outboxEvent.findUnique({ where: { eventId } });
    assert.equal(ev.status, 'PENDING');
    assert.ok(ev.attempts >= 1);
    assert.match(ev.lastError, /network/);
    assert.ok(ev.nextAttemptAt > new Date(), 'a retry is scheduled with backoff');

    await startOps();
    await prisma.outboxEvent.update({ where: { eventId }, data: { nextAttemptAt: new Date() } });
    await runOutbox(1);
    ev = await prisma.outboxEvent.findUnique({ where: { eventId } });
    assert.equal(ev.status, 'SENT');
    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [user.id]))[0].n, 1);
  });

  it('9. a purchase event that arrives before its learner event still lands on one learner (self-healing order)', async () => {
    // Make the learner event fail first, then process only the payment event
    const user = await registerAndVerify();
    await prisma.outboxEvent.update({ where: { eventId: `learner.verified:${user.id}` }, data: { nextAttemptAt: new Date(Date.now() + 3600e3) } });
    const course = await makeCourse('Out Of Order Course');
    await buy(user, course);
    await runOutbox(1);   // only the payment event is due: it carries the learner and creates it

    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [user.id]))[0].n, 1);
    await prisma.outboxEvent.update({ where: { eventId: `learner.verified:${user.id}` }, data: { nextAttemptAt: new Date() } });
    await runOutbox(1);   // the late learner event now arrives: updates, never duplicates
    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [user.id]))[0].n, 1);
    assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM enrollments e JOIN learners l ON l.id = e.learner_id WHERE l.lms_user_id = $1', [user.id]))[0].n, 1);
  });

  // ------------------------------------------------------------------------ requirement 9: trackable email + retries
  it('9a. an SMTP failure is retried without duplicating the email; exhausted emails become FAILED and an admin can retry them', async () => {
    const user = await registerAndVerify();
    const course = await makeCourse('Email Retry Course');
    const { payment } = await buy(user, course);
    const key = `purchase-onboarding:${payment.id}`;
    // isolate: only this email is due
    await prisma.emailLog.updateMany({ where: { dedupeKey: { not: key }, status: 'PENDING' }, data: { nextAttemptAt: new Date(Date.now() + 3600e3) } });
    const sentBefore = mail.sent.length;

    mail.failuresLeft = 1;
    const first = await emailService.processBatch();
    assert.equal(first.retry, 1);
    let log = await prisma.emailLog.findUnique({ where: { dedupeKey: key } });
    assert.equal(log.status, 'PENDING');
    assert.equal(log.attempts, 1);
    assert.match(log.lastError, /SMTP 421/);
    assert.equal(mail.sent.length, sentBefore, 'nothing delivered yet');

    await prisma.emailLog.update({ where: { dedupeKey: key }, data: { nextAttemptAt: new Date() } });
    assert.equal((await emailService.processBatch()).sent, 1);
    log = await prisma.emailLog.findUnique({ where: { dedupeKey: key } });
    assert.equal(log.status, 'SENT');
    assert.equal(log.attempts, 2);
    assert.equal(mail.sent.length, sentBefore + 1, 'delivered exactly once despite the retry');
    assert.equal(await emailService.retry(log.id), false, 'a SENT email cannot be re-sent by an admin');
    assert.equal((await emailService.processBatch()).sent, 0);

    // exhaust the attempts on a fresh purchase
    const user2 = await registerAndVerify();
    const course2 = await makeCourse('Email Failure Course');
    const { payment: p2 } = await buy(user2, course2);
    const key2 = `purchase-onboarding:${p2.id}`;
    await prisma.emailLog.updateMany({ where: { dedupeKey: { not: key2 }, status: 'PENDING' }, data: { nextAttemptAt: new Date(Date.now() + 3600e3) } });
    mail.failuresLeft = 99;
    for (let i = 0; i < emailService.MAX_ATTEMPTS; i += 1) {
      await prisma.emailLog.update({ where: { dedupeKey: key2 }, data: { nextAttemptAt: new Date() } });
      await emailService.processBatch();
    }
    let failed = await prisma.emailLog.findUnique({ where: { dedupeKey: key2 } });
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.attempts, emailService.MAX_ATTEMPTS);
    assert.match(failed.lastError, /SMTP 421/);

    // admin retry (through the real controller) once the provider recovers
    mail.failuresLeft = 0;
    const res = response();
    await require('../src/controllers/emailAdminController').retryEmail({ params: { id: failed.id }, user: { id: user.id }, ip: '::1', headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal((await prisma.emailLog.findUnique({ where: { id: failed.id } })).status, 'PENDING');
    assert.equal((await emailService.processBatch()).sent, 1);
    failed = await prisma.emailLog.findUnique({ where: { id: failed.id } });
    assert.equal(failed.status, 'SENT');
    assert.equal(mail.sent.filter((m) => m.to === user2.email).length, 1);

    const list = response();
    await require('../src/controllers/emailAdminController').listEmails({ query: { status: 'SENT', search: user2.email } }, list);
    assert.equal(list.body.data.emails.length, 1);
    assert.equal(list.body.data.emails[0].status, 'SENT');
  });

  // ------------------------------------------------------------------------ security of the service-to-service path
  it('10. the LMS callback endpoint rejects unsigned, mis-signed and replayed requests, and accepts duplicates idempotently', async () => {
    const { signedHeaders } = require('../src/utils/integrationSigner');
    const url = `http://127.0.0.1:${lmsPort}/api/integrations/operations/events`;
    const p = '/api/integrations/operations/events';
    const post = (body, secret = SECRET, headers) => {
      const raw = JSON.stringify(body);
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || signedHeaders(secret, { method: 'POST', path: p, body: raw })) }, body: raw });
    };
    const ev = (extra = {}) => ({
      event_id: `onboarding.completed:${state.enrollmentA.id}:${uid()}`, type: 'onboarding.completed',
      data: { lms_enrollment_id: state.enrollmentA.id, lms_user_id: state.user.id }, ...extra,
    });

    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await post(ev(), 'wrong-secret'.padEnd(48, 'x'))).status, 401);

    const e = ev();
    const hdrs = signedHeaders(SECRET, { method: 'POST', path: p, body: JSON.stringify(e) });
    assert.equal((await post(e, SECRET, hdrs)).status, 200);
    assert.equal((await post(e, SECRET, hdrs)).status, 401, 'same nonce = replay');
    assert.equal((await (await post(e)).json()).status, 'duplicate', 'same event_id with a fresh signature is a duplicate, not a second effect');

    const unknown = await post(ev({ data: { lms_enrollment_id: 'does-not-exist', lms_user_id: state.user.id } }));
    assert.equal(unknown.status, 404);
    const wrongUser = await post(ev({ data: { lms_enrollment_id: state.enrollmentA.id, lms_user_id: 'someone-else' } }));
    assert.equal(wrongUser.status, 404, 'an enrollment cannot be completed on behalf of another learner');
  });

  it('10b. the Operations integration API rejects unsigned requests', async () => {
    assert.equal((await fetch(`${opsUrl}/api/integrations/lms/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  });

  // ====================================================================== account creation paths
  describe('learner synchronization across every creation path', () => {
    const opsLearner = async (id) => (await opsQuery('SELECT * FROM learners WHERE lms_user_id = $1', [id]))[0];
    const queued = (id) => prisma.outboxEvent.count({ where: { eventId: `learner.verified:${id}` } });

    it('admin-created learner: nothing is synced until the real email is verified (first sign-in code)', async () => {
      const { createUser } = require('../src/controllers/userController');
      const email = `admin-made-${uid()}@journey.test`;
      const res = response();
      await createUser({ body: { email, password: 'Temp-Pass-123', firstName: 'Admin', lastName: 'Made', phone: '+91 90000 00001', role: 'STUDENT' }, user: { id: 'admin' } }, res);
      assert.equal(res.statusCode, 201);
      const user = await prisma.user.findUnique({ where: { email } });

      assert.equal(await lifecycle.sweepUnsyncedLearners(), 0, 'unverified accounts are never swept in');
      assert.equal(await queued(user.id), 0);

      // First sign-in: the individual learner must confirm the email with a one-time code
      const login = response();
      await auth.login({ body: { email, password: 'Temp-Pass-123' }, ip: '::1', headers: {} }, login);
      assert.equal(login.body.data.otpRequired, true, JSON.stringify(login.body));
      const ok = response();
      await auth.verifyEmailOtp({ body: { otpToken: login.body.data.otpToken, otp: otpSeen }, ip: '::1', headers: {} }, ok);
      assert.equal(ok.statusCode, 200);
      assert.equal(await queued(user.id), 1);

      await runOutbox();
      const learner = await opsLearner(user.id);
      assert.equal(learner.email, email);
      assert.equal(learner.registration_source, 'lms');
    });

    it('teacher-created and bulk-imported learners (placeholder emails) are never synced', async () => {
      const teacher = await prisma.user.create({ data: { email: `teacher-${uid()}@journey.test`, password: 'x', firstName: 'Tea', lastName: 'Cher', role: 'TEACHER', isEmailVerified: true } });
      const { createStudent } = require('../src/controllers/teacherController');
      const { importStudents } = require('../src/controllers/bulkImportController');

      const made = response();
      await createStudent({ user: { id: teacher.id, role: 'TEACHER' }, body: { firstName: 'Placeholder', lastName: `Pupil${uid()}`, guardianEmail: `guardian-${uid()}@journey.test` } }, made);
      assert.equal(made.statusCode, 201, JSON.stringify(made.body));
      const pupil = await prisma.user.findUnique({ where: { id: made.body.data.student.id } });
      assert.match(pupil.email, /@students\.derivion\.local$/);

      const imp = response();
      const csv = `firstName,lastName,guardianEmail,guardianPhone\nBulk,Pupil${uid()},bulkguardian-${uid()}@journey.test,9876500001\nBulk,Pupil${uid()},,9876500002`;
      await importStudents({ user: { id: teacher.id, role: 'TEACHER' }, body: { csvData: csv }, ip: '::1', headers: {} }, imp);
      assert.equal(imp.statusCode, 200, JSON.stringify(imp.body));
      const imported = await prisma.user.findMany({ where: { createdById: teacher.id, firstName: 'Bulk' } });
      assert.equal(imported.length, 2);

      // Even if someone marks them verified, a placeholder address is not a real address
      await prisma.user.updateMany({ where: { createdById: teacher.id }, data: { isEmailVerified: true } });
      await lifecycle.sweepUnsyncedLearners();
      for (const u of [pupil, ...imported]) {
        assert.equal(await queued(u.id), 0, `${u.email} must not be synced`);
        assert.equal(await opsLearner(u.id), undefined);
      }
      state.pupil = pupil;
    });

    it('a placeholder account that later receives a real, verified email is synced automatically (and only then)', async () => {
      const pupil = state.pupil;
      const email = `grown-up-${uid()}@journey.test`;
      // real address but NOT verified yet
      await prisma.user.update({ where: { id: pupil.id }, data: { email, isEmailVerified: false } });
      assert.equal(await lifecycle.sweepUnsyncedLearners(), 0);
      assert.equal(await queued(pupil.id), 0);

      await prisma.user.update({ where: { id: pupil.id }, data: { isEmailVerified: true } });
      await lifecycle.sweepUnsyncedLearners();
      assert.equal(await queued(pupil.id), 1);
      await lifecycle.sweepUnsyncedLearners();
      assert.equal(await queued(pupil.id), 1, 'sweeping again never queues a second event');
      await runOutbox();
      const learner = await opsLearner(pupil.id);
      assert.equal(learner.email, email);
      assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [pupil.id]))[0].n, 1);
    });

    it('invalid, reserved and unverified addresses are rejected by the eligibility rules', () => {
      for (const email of ['not-an-email', 'a@@b.com', 'x@localhost', 'y@mail.invalid', 'someone@example.com', 'p@students.derivion.local', '']) {
        assert.equal(lifecycle.isRealEmail(email), false, email);
      }
      assert.equal(lifecycle.isRealEmail('person@gmail.com'), true);
      const base = { role: 'STUDENT', isActive: true, isEmailVerified: true, email: 'person@gmail.com' };
      assert.equal(lifecycle.eligible(base), true);
      assert.equal(lifecycle.eligible({ ...base, isEmailVerified: false }), false);
      assert.equal(lifecycle.eligible({ ...base, isActive: false }), false);
      assert.equal(lifecycle.eligible({ ...base, role: 'TEACHER' }), false);
    });

    it('an admin renaming a synchronized learner updates the same Operations learner; saving the same values again changes nothing', async () => {
      const { updateUser } = require('../src/controllers/userController');
      const save = async (firstName) => {
        const res = response();
        await updateUser({ params: { id: state.user.id }, body: { firstName }, user: { id: 'admin' }, ip: '::1', headers: {} }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      };
      await save('Ashwini');
      await save('Ashwini');
      assert.equal(await prisma.outboxEvent.count({ where: { type: 'learner.updated', aggregateId: state.user.id } }), 1);
      await runOutbox();
      assert.equal((await opsQuery('SELECT first_name FROM learners WHERE lms_user_id = $1', [state.user.id]))[0].first_name, 'Ashwini');
      assert.equal((await opsQuery('SELECT COUNT(*)::int AS n FROM learners WHERE lms_user_id = $1', [state.user.id]))[0].n, 1);
    });
  });

  // ====================================================================== payments
  describe('failed, successful, duplicate and refunded payments', () => {
    it('failed payment: marked FAILED once, learner is told, nothing is enrolled; a later successful retry on the same order then enrols', async () => {
      const user = await registerAndVerify();
      const course = await makeCourse('Failure Then Success');
      const payment = await newPendingPayment(user, course);
      const fail = { id: `pay_${uid()}`, order_id: payment.razorpayOrderId, amount: 499900, error_description: 'Card declined by bank' };

      await razorpayEvent('payment.failed', fail);
      await razorpayEvent('payment.failed', fail);   // Razorpay redelivers
      assert.equal((await prisma.payment.findUnique({ where: { id: payment.id } })).status, 'FAILED');
      assert.equal(await prisma.enrollment.count({ where: { userId: user.id, courseId: course.id } }), 0);
      assert.equal(await prisma.emailLog.count({ where: { dedupeKey: `payment-failed:${payment.id}` } }), 1);
      assert.equal(await prisma.invoice.count({ where: { paymentId: payment.id } }), 0);
      assert.equal(await prisma.outboxEvent.count({ where: { eventId: `payment.failed:${payment.id}` } }), 1);

      await flush();
      const msg = mailsTo(user.email, 'did not go through');
      assert.equal(msg.length, 1);
      assert.ok(msg[0].html.includes('Card declined by bank'));
      assert.ok(msg[0].html.includes('4,999.00'));
      assert.equal(msg[0].attachments, undefined, 'no invoice for a failed payment');
      assert.equal((await opsQuery("SELECT status FROM integration_events WHERE event_type = 'payment.failed' ORDER BY id DESC LIMIT 1"))[0].status, 'PROCESSED');

      // the learner retries on the same Razorpay order and it succeeds
      const paid = { id: `pay_${uid()}`, order_id: payment.razorpayOrderId, amount: 499900 };
      await razorpayEvent('payment.captured', paid);
      assert.equal((await prisma.payment.findUnique({ where: { id: payment.id } })).status, 'SUCCESS');
      assert.equal(await prisma.enrollment.count({ where: { userId: user.id, courseId: course.id } }), 1);
      assert.equal(await prisma.invoice.count({ where: { paymentId: payment.id } }), 1);
      // a failure report that arrives AFTER success must never downgrade it
      await razorpayEvent('payment.failed', fail);
      assert.equal((await prisma.payment.findUnique({ where: { id: payment.id } })).status, 'SUCCESS');
    });

    it('duplicate payment for a course already onboarded: one enrollment, a second invoice, a confirmation email without a link, onboarding untouched, nothing sent to Operations', async () => {
      // state.user has completed onboarding for courseA (earlier test)
      const eventsBefore = await prisma.outboxEvent.count({ where: { type: 'payment.successful', aggregateId: state.enrollmentA.id } });
      const tokensBefore = await prisma.onboardingToken.count({ where: { enrollmentId: state.enrollmentA.id } });
      const opsEnrBefore = (await opsQuery('SELECT * FROM enrollments WHERE lms_enrollment_id = $1', [state.enrollmentA.id]))[0];

      const second = await buy(state.user, state.courseA);
      assert.equal(await prisma.enrollment.count({ where: { userId: state.user.id, courseId: state.courseA.id } }), 1, 'no second enrollment');
      const enr = await prisma.enrollment.findUnique({ where: { id: state.enrollmentA.id } });
      assert.equal(enr.onboardingStatus, 'ONBOARDING_COMPLETED', 'onboarding is not reset');
      assert.equal(await prisma.onboardingToken.count({ where: { enrollmentId: enr.id } }), tokensBefore, 'no new link');
      assert.equal(await prisma.invoice.count({ where: { paymentId: second.payment.id } }), 1, 'the second payment still gets its invoice');
      assert.equal(await prisma.outboxEvent.count({ where: { type: 'payment.successful', aggregateId: enr.id } }), eventsBefore, 'Operations is not told');
      assert.ok(await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_VERIFIED', targetId: second.payment.id } }), 'audit entry written');

      await flush();
      const msgs = mailsTo(state.user.email, 'Additional payment');
      assert.equal(msgs.length, 1);
      assert.ok(!/onboarding\/[a-f0-9]{64}/.test(msgs[0].html), 'no onboarding link in a duplicate-payment email');
      assert.ok(msgs[0].html.includes('already enrolled'));
      assert.equal(msgs[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');

      const opsEnrAfter = (await opsQuery('SELECT * FROM enrollments WHERE lms_enrollment_id = $1', [state.enrollmentA.id]))[0];
      assert.equal(opsEnrAfter.onboarding_status, 'ONBOARDING_COMPLETED');
      assert.equal(opsEnrAfter.payment_reference, opsEnrBefore.payment_reference);
      state.duplicatePayment = second.payment;
    });

    it('a second course keeps the learner\'s general onboarding COMPLETED in Operations while its own enrollment starts pending', async () => {
      const learner = (await opsQuery('SELECT * FROM learners WHERE lms_user_id = $1', [state.user.id]))[0];
      assert.equal(learner.onboarding_status, 'ONBOARDING_COMPLETED');
      const course = await makeCourse('Third Course');
      const buyC = await buy(state.user, course);
      await flush();
      const after = (await opsQuery('SELECT * FROM learners WHERE lms_user_id = $1', [state.user.id]))[0];
      assert.equal(after.onboarding_status, 'ONBOARDING_COMPLETED', 'general onboarding is not reset');
      const enrC = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: state.user.id, courseId: course.id } } });
      assert.equal(enrC.onboardingStatus, 'ONBOARDING_PENDING');
      const view = await opsGet(tokenFromLastMail(state.user.email).token);
      assert.equal(view.onboarding.mode, 'returning');
      assert.equal(view.enrollment.programme, 'Third Course');
      state.buyC = buyC;
    });

    it('refund: payment and enrollment revoked, one refund email with the amount and reference, one event, Operations updated; a repeated refund webhook changes nothing', async () => {
      const user = await registerAndVerify();
      const course = await makeCourse('Refundable Course');
      const { payment, rzpPaymentId } = await buy(user, course);
      await flush();
      const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } });

      const refund = { id: `rfnd_${uid()}`, payment_id: rzpPaymentId };
      await razorpayEvent('refund.processed', { id: rzpPaymentId }, { refund: { entity: refund } });
      await razorpayEvent('refund.processed', { id: rzpPaymentId }, { refund: { entity: refund } });

      const paid = await prisma.payment.findUnique({ where: { id: payment.id } });
      assert.equal(paid.status, 'REFUNDED');
      assert.equal(paid.refundId, refund.id);
      assert.equal((await prisma.enrollment.findUnique({ where: { id: enrollment.id } })).status, 'REFUNDED');
      assert.equal(await prisma.outboxEvent.count({ where: { eventId: `payment.refunded:${payment.id}` } }), 1);
      assert.equal(await prisma.emailLog.count({ where: { dedupeKey: `refund:${payment.id}` } }), 1);

      await flush();
      const msgs = mailsTo(user.email, 'Refund processed');
      assert.equal(msgs.length, 1);
      for (const t of ['Refundable Course', '4,999.00', rzpPaymentId, refund.id]) assert.ok(msgs[0].html.includes(t), t);

      const ops = (await opsQuery('SELECT payment_status, enrollment_status FROM enrollments WHERE lms_enrollment_id = $1', [enrollment.id]))[0];
      assert.equal(ops.payment_status, 'REFUNDED');
      assert.equal(ops.enrollment_status, 'REFUNDED');
      state.refunded = { user, course, enrollment };
    });

    it('buying again after a refund restores the SAME enrollment and issues a fresh link (no second enrollment)', async () => {
      const { user, course, enrollment } = state.refunded;
      await buy(user, course);
      await flush();
      const enr = await prisma.enrollment.findMany({ where: { userId: user.id, courseId: course.id } });
      assert.equal(enr.length, 1);
      assert.equal(enr[0].id, enrollment.id);
      assert.equal(enr[0].status, 'ACTIVE');
      assert.equal(enr[0].onboardingStatus, 'ONBOARDING_PENDING');
      const ops = (await opsQuery('SELECT payment_status, enrollment_status FROM enrollments WHERE lms_enrollment_id = $1', [enrollment.id]))[0];
      assert.equal(ops.payment_status, 'PAID');
      assert.equal(ops.enrollment_status, 'ACTIVE');
    });
  });

  // ====================================================================== visibility, retries and housekeeping
  describe('email history, admin retry, reminders and invoices', () => {
    it('delivery results appear in the Operations email history, and an Operations admin can retry a failed email through the LMS', async () => {
      const user = await registerAndVerify();
      const course = await makeCourse('History Course');
      const { payment } = await buy(user, course);
      const key = `purchase-onboarding:${payment.id}`;
      await prisma.emailLog.updateMany({ where: { dedupeKey: { not: key }, status: 'PENDING' }, data: { nextAttemptAt: new Date(Date.now() + 3600e3) } });

      mail.failuresLeft = 99;
      for (let i = 0; i < emailService.MAX_ATTEMPTS; i += 1) {
        await prisma.emailLog.update({ where: { dedupeKey: key }, data: { nextAttemptAt: new Date() } });
        await emailService.processBatch();
      }
      mail.failuresLeft = 0;
      assert.equal((await prisma.emailLog.findUnique({ where: { dedupeKey: key } })).status, 'FAILED');
      await runOutbox();

      const log = await prisma.emailLog.findUnique({ where: { dedupeKey: key } });
      const row = (await opsQuery('SELECT * FROM communication_logs WHERE external_ref = $1', [log.id]))[0];
      assert.equal(row.status, 'FAILED');
      assert.match(row.error, /SMTP 421/);
      assert.equal(row.recipient, user.email);

      // an Operations admin logs in and presses "retry"
      const { Client } = require('pg');
      const c = new Client({ connectionString: opsDbUrl });
      await c.connect();
      await c.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Admin','ops-admin@journey.test',$1,'admin') ON CONFLICT DO NOTHING", [require('bcryptjs').hashSync('Correct-Horse-9', 4)]);
      await c.end();
      const token = (await (await fetch(`${opsUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ops-admin@journey.test', password: 'Correct-Horse-9' }) })).json()).token;
      const retry = await fetch(`${opsUrl}/api/operations/integration/emails/${row.id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      assert.equal(retry.status, 200, await retry.clone().text());
      assert.equal((await prisma.emailLog.findUnique({ where: { id: log.id } })).status, 'PENDING');
      assert.ok(await prisma.auditLog.findFirst({ where: { action: 'ADMIN_ACTION', targetId: log.id } }));

      assert.equal((await emailService.processBatch()).sent, 1);
      await runOutbox();
      assert.equal((await opsQuery('SELECT status FROM communication_logs WHERE external_ref = $1', [log.id]))[0].status, 'SENT');
      assert.equal(mailsTo(user.email, 'History Course').length, 1, 'exactly one copy reached the learner');
    });

    it('the learner is told once when Operations confirms their onboarding', async () => {
      await flush();
      const msgs = mailsTo(state.user.email, 'Onboarding received');
      assert.ok(msgs.length >= 2, 'one per completed enrollment');
      const per = await prisma.emailLog.count({ where: { template: 'onboarding-completed', toEmail: state.user.email } });
      assert.equal(per, msgs.length);
    });

    it('onboarding reminders follow the configured schedule: once per step, only while onboarding is pending and the link is valid', async () => {
      process.env.ONBOARDING_REMINDER_DAYS = '1,5';
      try {
        const user = await registerAndVerify();
        const course = await makeCourse('Reminder Course');
        await buy(user, course);
        const enr = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } });
        await flush();

        assert.equal(await lifecycle.queueOnboardingReminders(), 0, 'too early');
        await prisma.enrollment.update({ where: { id: enr.id }, data: { enrolledAt: new Date(Date.now() - 2 * 86400000) } });
        await lifecycle.queueOnboardingReminders();
        await lifecycle.queueOnboardingReminders();
        assert.equal(await prisma.emailLog.count({ where: { enrollmentId: enr.id, template: 'onboarding-reminder' } }), 1, 'step 1 only once');
        await flush();
        const rem = mailsTo(user.email, 'Reminder: complete your onboarding');
        assert.equal(rem.length, 1);
        assert.match(rem[0].html, /onboarding\/[a-f0-9]{64}/);

        await prisma.enrollment.update({ where: { id: enr.id }, data: { enrolledAt: new Date(Date.now() - 6 * 86400000) } });
        await lifecycle.queueOnboardingReminders();
        assert.equal(await prisma.emailLog.count({ where: { enrollmentId: enr.id, template: 'onboarding-reminder' } }), 2, 'step 2 queued once the second delay has passed');

        // once onboarding is done, no more reminders
        await prisma.enrollment.update({ where: { id: enr.id }, data: { onboardingStatus: 'ONBOARDING_COMPLETED' } });
        await prisma.enrollment.update({ where: { id: enr.id }, data: { enrolledAt: new Date(Date.now() - 30 * 86400000) } });
        assert.equal(await lifecycle.queueOnboardingReminders(), 0);
      } finally {
        delete process.env.ONBOARDING_REMINDER_DAYS;
      }
    });

    it('the buyer (and an admin) can download the invoice PDF; another learner cannot', async () => {
      const { downloadInvoice } = require('../src/controllers/invoiceController');
      const get = async (user) => {
        const res = Object.assign(response(), {
          chunks: [], setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; },
        });
        await downloadInvoice({ params: { id: state.buyA.payment.id }, user }, res);
        return res;
      };
      const mine = await get({ id: state.user.id, role: 'STUDENT' });
      assert.equal(mine.headers['Content-Type'], 'application/pdf');
      assert.equal(Buffer.from(mine.body).subarray(0, 5).toString(), '%PDF-');
      assert.equal((await get({ id: 'someone-else', role: 'STUDENT' })).statusCode, 404);
      assert.equal((await get({ id: 'an-admin', role: 'ADMIN' })).statusCode, 200);
    });
  });
});
