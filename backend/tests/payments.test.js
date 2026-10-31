const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { beforeEach, describe, it } = require('node:test');
const { installMockModule, response } = require('./helpers/mocks');

process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';

const db = {};
let rzpPayment;
const refunds = [];
const reset = () => {
  db.payments = [{ id: 'p1', userId: 'buyer', courseId: 'c1', amount: 499, status: 'PENDING', razorpayOrderId: 'order_1', razorpayPaymentId: null }];
  db.enrollments = [];
  rzpPayment = { id: 'pay_1', order_id: 'order_1', amount: 49900, status: 'captured' };
  refunds.length = 0;
};

const matchPayment = (where) => db.payments.find((p) =>
  (where.OR || [where]).some((cond) => Object.entries(cond).every(([k, v]) => p[k] === v)));

const prisma = {
  // The code under test now wraps related writes in a transaction; the in-memory fake just runs the callback
  $transaction: async (fn) => fn(prisma),
  payment: {
    findFirst: async ({ where }) => matchPayment(where) || null,
    findUnique: async ({ where }) => db.payments.find((p) => p.id === where.id) || null,
    update: async ({ where, data }) => Object.assign(db.payments.find((p) => p.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const p = db.payments.find((x) => x.id === where.id);
      const w = where.status;
      const ok = typeof w === 'string' ? p?.status === w : w.in ? w.in.includes(p?.status) : p?.status !== w.not;
      if (!p || !ok) return { count: 0 };
      Object.assign(p, data);
      return { count: 1 };
    },
  },
  enrollment: {
    findUnique: async ({ where }) => db.enrollments.find((e) => e.userId === where.userId_courseId.userId && e.courseId === where.userId_courseId.courseId) || null,
    create: async ({ data }) => { const e = { id: `e${db.enrollments.length + 1}`, status: 'ACTIVE', ...data }; db.enrollments.push(e); return e; },
    update: async ({ where, data }) => Object.assign(db.enrollments.find((e) => e.id === where.id), data),
    updateMany: async ({ where, data }) => {
      db.enrollments.filter((e) => e.userId === where.userId && e.courseId === where.courseId).forEach((e) => Object.assign(e, data));
      return { count: 1 };
    },
  },
  course: { update: async () => ({}), findUnique: async () => ({ id: 'c1', title: 'Course', slug: 'course' }) },
  user: { findUnique: async () => ({ id: 'buyer', firstName: 'B', email: 'b@example.com' }) },
  notification: { create: async () => ({}) },
  siteSettings: { findMany: async () => [] },
};

installMockModule(require.resolve('../src/config/database'), prisma);
installMockModule(require.resolve('../src/config/email'), {
  sendEmail: () => {},
  emailTemplates: { enrollmentConfirmation: () => ({ subject: 's', html: 'h' }) },
});
installMockModule(require.resolve('razorpay'), class MockRazorpay {
  constructor() {
    this.payments = {
      fetch: async () => rzpPayment,
      refund: async (id, opts) => { refunds.push({ id, ...opts }); return { id: 'rfnd_1' }; },
    };
    this.orders = { fetchPayments: async () => ({ items: [rzpPayment] }) };
  }
});

const { verifyPayment, webhook, adminRefundPayment } = require('../src/controllers/paymentController');

const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', 'test_secret').update(`${orderId}|${paymentId}`).digest('hex');

const verify = async (body, userId = 'buyer') => {
  const res = response();
  await verifyPayment({ body, user: { id: userId } }, res);
  return res;
};

const sendWebhook = async (payload, secret = 'webhook_secret') => {
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const res = response();
  await webhook({ body: raw, headers: { 'x-razorpay-signature': signature } }, res);
  return res;
};

describe('payment verification', () => {
  beforeEach(reset);

  it('enrolls the buyer on a valid signature', async () => {
    const res = await verify({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_1', 'pay_1') });
    assert.equal(res.statusCode, 200);
    assert.equal(db.payments[0].status, 'SUCCESS');
    assert.equal(db.enrollments.length, 1);
  });

  it("does not let another user verify (or tamper with) someone else's payment", async () => {
    const res = await verify({ razorpay_order_id: 'order_1', razorpay_payment_id: 'x', razorpay_signature: 'bad' }, 'attacker');
    assert.equal(res.statusCode, 404);
    assert.equal(db.payments[0].status, 'PENDING');
  });

  it('never downgrades a successful payment when a bad signature arrives later', async () => {
    db.payments[0].status = 'SUCCESS';
    const res = await verify({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' });
    assert.equal(res.statusCode, 200); // already verified — idempotent
    assert.equal(db.payments[0].status, 'SUCCESS');
  });

  it('marks only an open payment as failed on a bad signature', async () => {
    const res = await verify({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' });
    assert.equal(res.statusCode, 400);
    assert.equal(db.payments[0].status, 'FAILED');
    assert.equal(db.enrollments.length, 0);
  });

  it('rejects a payment whose captured amount differs from the order', async () => {
    rzpPayment.amount = 100; // ₹1 instead of ₹499
    const res = await verify({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_1', 'pay_1') });
    assert.equal(res.statusCode, 400);
    assert.equal(db.enrollments.length, 0);
  });
});

describe('payment webhook and refunds', () => {
  beforeEach(reset);

  it('rejects an unsigned or wrongly signed webhook', async () => {
    const res = await sendWebhook({ event: 'payment.captured', payload: {} }, 'wrong_secret');
    assert.equal(res.statusCode, 401);
  });

  it('completes the payment once even if the webhook is delivered twice', async () => {
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 49900 } } } };
    await sendWebhook(payload);
    await sendWebhook(payload);
    assert.equal(db.payments[0].status, 'SUCCESS');
    assert.equal(db.enrollments.length, 1);
  });

  it('revokes course access when a refund is processed', async () => {
    Object.assign(db.payments[0], { status: 'SUCCESS', razorpayPaymentId: 'pay_1' });
    db.enrollments.push({ id: 'e1', userId: 'buyer', courseId: 'c1', status: 'ACTIVE' });
    await sendWebhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_9', payment_id: 'pay_1' } } } });
    assert.equal(db.payments[0].status, 'REFUNDED');
    assert.equal(db.enrollments[0].status, 'REFUNDED');
  });

  it('lets an admin refund a successful payment in full', async () => {
    Object.assign(db.payments[0], { status: 'SUCCESS', razorpayPaymentId: 'pay_1' });
    const res = response();
    await adminRefundPayment({ params: { id: 'p1' }, body: { reason: 'duplicate' }, user: { id: 'admin' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(refunds[0].amount, 49900);
    assert.equal(db.payments[0].status, 'REFUNDED');
  });
});
