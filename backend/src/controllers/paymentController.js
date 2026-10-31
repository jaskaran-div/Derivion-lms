const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../config/database');
const { sendEmail, emailTemplates } = require('../config/email');
const { getCheckoutConfigurationId } = require('../utils/razorpayConfig');
const { getSettings } = require('../services/settings');
const { notifyUser } = require('../services/notify');
const { isPlaceholderEmail } = require('../utils/credentials');
const lifecycle = require('../services/lifecycle');
const { isEnabled: integrationEnabled } = require('../config/integration');

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay credentials not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.');
  }
  return new Razorpay({ key_id, key_secret });
};

// POST /api/payments/create-order
const createOrder = async (req, res) => {
  let courseId;
  let checkoutConfigId;
  try {
    ({ courseId } = req.body);
    const userId = req.user.id;

    if (typeof courseId !== 'string' || !courseId.trim()) {
      return res.status(400).json({ success: false, message: 'A valid course ID is required.' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId, status: 'PUBLISHED' } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existingEnrollment && existingEnrollment.status !== 'REFUNDED') {
      return res.status(409).json({ success: false, message: 'Already enrolled in this course.' });
    }

    const { enrollment: enrollmentRules } = await getSettings();
    if (enrollmentRules.maxEnrollmentsPerUser > 0) {
      const count = await prisma.enrollment.count({ where: { userId, status: { not: 'REFUNDED' } } });
      if (count >= enrollmentRules.maxEnrollmentsPerUser) {
        return res.status(403).json({ success: false, message: `You can be enrolled in at most ${enrollmentRules.maxEnrollmentsPerUser} courses.` });
      }
    }

    // If free course, enroll directly
    if (course.isFree || parseFloat(course.price) === 0) {
      const enrollment = existingEnrollment
        ? await prisma.enrollment.update({ where: { id: existingEnrollment.id }, data: { status: 'ACTIVE' } })
        : await prisma.enrollment.create({ data: { userId, courseId } });
      await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
      // Free enrollment: no payment and no invoice; sync to Operations + onboarding link for eligible learners
      await lifecycle.afterEnrollmentCreated({ userId, courseId, source: 'free' });
      return res.json({ success: true, message: 'Enrolled successfully (free course).', data: { enrollment } });
    }

    const amount = parseFloat(course.discountPrice || course.price);
    const amountInPaise = Math.round(amount * 100);
    checkoutConfigId = getCheckoutConfigurationId(course.emiEnabled);
    if (!checkoutConfigId) {
      return res.status(503).json({
        success: false,
        message: 'Payment checkout configuration is not available.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Initialize Razorpay
    const razorpay = getRazorpayInstance();

    console.info('Creating Razorpay order with payment configuration:', {
      courseId,
      emiEnabled: course.emiEnabled === true,
      checkoutConfigId,
      razorpayKeyMode: process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')
        ? 'test'
        : process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_')
          ? 'live'
          : 'unknown',
    });

    // Create Razorpay order
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      checkout_config_id: checkoutConfigId,
      receipt: `rcpt_${Date.now()}_${userId.slice(0, 6)}`,
      notes: {
        userId,
        courseId,
        courseTitle: course.title,
        userEmail: user?.email || '',
      },
    });

    // Create payment record in database
    await prisma.payment.create({
      data: {
        userId,
        courseId,
        amount,
        currency: 'INR',
        razorpayOrderId: rzpOrder.id,
        status: 'PENDING',
        gatewayResponse: rzpOrder,
      },
    });

    res.json({
      success: true,
      data: {
        orderId: rzpOrder.id,
        razorpayOrderId: rzpOrder.id,
        amount,
        amountInPaise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        checkoutConfigId,
        course: { id: course.id, title: course.title, thumbnail: course.thumbnail },
        prefill: {
          name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          email: user?.email || '',
          contact: user?.phone || '',
        },
      },
    });
  } catch (error) {
    if (error?.statusCode && error?.error) {
      console.error('Razorpay order request rejected:', {
        courseId,
        checkoutConfigId,
        statusCode: error.statusCode,
        code: error.error.code,
        description: error.error.description,
        reason: error.error.reason,
        source: error.error.source,
        step: error.error.step,
      });

      if (error.error.description === 'The id provided does not exist') {
        return res.status(502).json({
          success: false,
          message: 'Razorpay could not find this payment configuration. Verify that the configuration ID and API keys belong to the same Razorpay account and mode.',
        });
      }

      return res.status(502).json({
        success: false,
        message: 'Razorpay rejected the payment order request.',
      });
    }

    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create payment order.' });
  }
};

// Constant-time comparison of two hex signatures
const safeEqualHex = (x, y) => {
  if (typeof x !== 'string' || typeof y !== 'string' || x.length !== y.length) return false;
  return crypto.timingSafeEqual(Buffer.from(x, 'utf8'), Buffer.from(y, 'utf8'));
};

// Move a payment to SUCCESS exactly once and grant (or restore) the enrollment.
// Everything that must stay consistent happens in ONE transaction: the payment status, the enrollment, the invoice,
// the onboarding token, the Operations sync event and the confirmation email. If any step fails nothing is kept and
// Razorpay's webhook retry simply runs it again; if two requests race, only the one that flips the status continues.
// Returns true if this call performed the transition.
const completePayment = async (payment, { razorpayPaymentId, razorpaySignature, gatewayResponse }) => {
  const outcome = await prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'SUCCESS',
        ...(razorpayPaymentId && { razorpayPaymentId }),
        ...(razorpaySignature && { razorpaySignature }),
        ...(gatewayResponse && { gatewayResponse }),
      },
    });
    if (count === 0 || !payment.courseId) return null;

    let enrollment = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
    });
    const previous = enrollment ? { ...enrollment } : null;   // the enrollment as it was before this payment
    if (!enrollment) {
      enrollment = await tx.enrollment.create({ data: { userId: payment.userId, courseId: payment.courseId } });
      await tx.course.update({ where: { id: payment.courseId }, data: { totalStudents: { increment: 1 } } });
    } else if (enrollment.status === 'REFUNDED') {
      enrollment = await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'ACTIVE' } });
    }

    const [user, course] = await Promise.all([
      tx.user.findUnique({ where: { id: payment.userId } }),
      tx.course.findUnique({ where: { id: payment.courseId } }),
    ]);
    const fresh = { ...payment, razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId };
    const lifecycleResult = user && course
      ? await lifecycle.onPaymentSucceeded(tx, { payment: fresh, user, course, enrollment, previous })
      : null;
    return { user, course, lifecycleResult };
  });
  if (!outcome) return false;

  const { user, course, lifecycleResult } = outcome;
  if (user && course) {
    // With the Operations integration active, the purchase/onboarding email is queued above and replaces this one
    if (!lifecycleResult && !(integrationEnabled() && lifecycle.eligible(user))) {
      try {
        const { subject, html } = emailTemplates.enrollmentConfirmation(user.firstName, course.title);
        if (!isPlaceholderEmail(user.email)) sendEmail({ to: user.email, subject, html });
      } catch (e) {
        console.error('Failed to send enrollment email:', e);
      }
    }
    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: 'Course Enrollment Successful! 🎉',
        message: `You are now enrolled in "${course.title}".`,
        type: 'SUCCESS',
        link: `/courses/${course.slug}`,
      },
    }).catch(() => {});
  }
  return true;
};

// Mark a payment refunded and revoke the course access it bought
const applyRefund = async (payment, refundId) => {
  if (payment.status === 'REFUNDED') return false;
  let refundMailQueued = false;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'REFUNDED' } },
      data: { status: 'REFUNDED', refundId: refundId || null, refundedAt: new Date() },
    });
    if (count === 0) return;   // another request refunded it first
    if (payment.courseId) {
      await tx.enrollment.updateMany({
        where: { userId: payment.userId, courseId: payment.courseId },
        data: { status: 'REFUNDED' },
      });
      const [enrollment, user, course] = await Promise.all([
        tx.enrollment.findUnique({ where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } }, select: { id: true } }),
        tx.user.findUnique({ where: { id: payment.userId } }),
        tx.course.findUnique({ where: { id: payment.courseId } }),
      ]);
      refundMailQueued = lifecycle.eligible(user) && Boolean(enrollment) && integrationEnabled();
      await lifecycle.onPaymentRefunded(tx, { payment: { ...payment, refundId: refundId || null }, user, course, enrollmentId: enrollment?.id });
    }
  });
  await notifyUser(payment.userId, {
    title: 'Refund processed',
    message: `Your payment of ₹${Number(payment.amount).toLocaleString('en-IN')} has been refunded.`,
    type: 'INFO',
    link: '/payments',
  }, { email: !refundMailQueued }).catch(() => {});   // the queued refund email replaces the generic one
  return true;
};

// POST /api/payments/verify — called by the checkout page after Razorpay returns
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id: rzpOrderIdBody,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: rzpSignature,
      orderId: fallbackOrderId,
    } = req.body;
    const rzpOrderId = rzpOrderIdBody || fallbackOrderId;

    if (!rzpOrderId || typeof rzpOrderId !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing order ID.' });
    }

    const payment = await prisma.payment.findFirst({
      where: { OR: [{ razorpayOrderId: rzpOrderId }, { cashfreeOrderId: rzpOrderId }, { id: rzpOrderId }] },
    });

    // Only the buyer can verify their own payment
    if (!payment || payment.userId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (payment.status === 'SUCCESS') {
      return res.json({ success: true, message: 'Payment already verified.', data: { status: 'PAID' } });
    }
    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ success: false, message: 'This payment was refunded.' });
    }

    const orderId = payment.razorpayOrderId || rzpOrderId;
    const expectedPaise = Math.round(Number(payment.amount) * 100);
    let isVerified = false;
    let capturedPaymentId = rzpPaymentId;

    if (rzpPaymentId && rzpSignature) {
      const generated = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${rzpPaymentId}`)
        .digest('hex');
      isVerified = safeEqualHex(generated, String(rzpSignature));

      // Defence in depth: confirm the order and amount with Razorpay when reachable
      if (isVerified) {
        try {
          const rzpPayment = await getRazorpayInstance().payments.fetch(rzpPaymentId);
          if (rzpPayment.order_id !== orderId || Number(rzpPayment.amount) !== expectedPaise
            || !['captured', 'authorized'].includes(rzpPayment.status)) {
            console.error('Payment mismatch on verify:', { orderId, rzpPaymentId, status: rzpPayment.status, amount: rzpPayment.amount, expectedPaise });
            isVerified = false;
          }
        } catch (err) {
          console.warn('Could not fetch payment from Razorpay; relying on signature:', err.message);
        }
      }
    } else {
      // No signature (e.g. redirect flow): ask Razorpay for a captured payment of the right amount
      try {
        const list = await getRazorpayInstance().orders.fetchPayments(orderId);
        const captured = list.items?.find((p) => p.status === 'captured' && Number(p.amount) === expectedPaise);
        if (captured) {
          isVerified = true;
          capturedPaymentId = captured.id;
        }
      } catch (err) {
        console.error('Fetch payments error during verification:', err.message);
      }
    }

    if (isVerified) {
      await completePayment(payment, {
        razorpayPaymentId: capturedPaymentId,
        razorpaySignature: rzpSignature,
        gatewayResponse: { rzpOrderId: orderId, rzpPaymentId: capturedPaymentId },
      });
      return res.json({ success: true, message: 'Payment verified. Enrollment activated.', data: { status: 'PAID' } });
    }

    // Never downgrade a settled payment; only an open one becomes FAILED
    await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    return res.status(400).json({ success: false, message: 'Invalid payment signature or payment not captured.' });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment.' });
  }
};

// POST /api/payments/webhook - Razorpay webhook (raw body, signed)
const webhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!signature || !secret) {
      return res.status(401).json({ success: false, message: 'Missing webhook signature or secret.' });
    }

    const rawPayload = Buffer.isBuffer(req.body)
      ? req.body
      : (typeof req.body === 'string' ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body)));

    const expectedSig = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
    if (!safeEqualHex(expectedSig, String(signature))) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawPayload.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Malformed JSON payload.' });
    }

    const event = parsedBody?.event;
    const payload = parsedBody?.payload;
    const paymentEntity = payload?.payment?.entity;

    if (event === 'payment.captured' || event === 'order.paid') {
      const orderId = paymentEntity?.order_id || payload?.order?.entity?.id;
      if (orderId) {
        const payment = await prisma.payment.findFirst({
          where: { OR: [{ razorpayOrderId: orderId }, { cashfreeOrderId: orderId }] },
        });
        const expectedPaise = payment ? Math.round(Number(payment.amount) * 100) : null;
        const paidPaise = paymentEntity?.amount ?? payload?.order?.entity?.amount_paid;
        if (payment && (paidPaise === undefined || Number(paidPaise) === expectedPaise)) {
          await completePayment(payment, { razorpayPaymentId: paymentEntity?.id, gatewayResponse: payload });
        } else if (payment) {
          console.error('Webhook amount mismatch:', { orderId, paidPaise, expectedPaise });
        }
      }
    } else if (event === 'payment.failed') {
      const orderId = paymentEntity?.order_id;
      const payment = orderId && await prisma.payment.findFirst({ where: { OR: [{ razorpayOrderId: orderId }, { cashfreeOrderId: orderId }] } });
      if (payment) {
        const reason = paymentEntity?.error_description || paymentEntity?.error_reason || null;
        await prisma.$transaction(async (tx) => {
          // Only an open payment becomes FAILED; a payment that already succeeded is never downgraded
          const { count } = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
          if (count === 0) return;
          const [user, course] = await Promise.all([
            tx.user.findUnique({ where: { id: payment.userId } }),
            payment.courseId ? tx.course.findUnique({ where: { id: payment.courseId } }) : null,
          ]);
          await lifecycle.onPaymentFailed(tx, { payment, user, course, reason });
        });
      }
    } else if (event === 'refund.processed' || event === 'payment.refunded') {
      const refundEntity = payload?.refund?.entity;
      const rzpPaymentId = refundEntity?.payment_id || paymentEntity?.id;
      if (rzpPaymentId) {
        const payment = await prisma.payment.findFirst({ where: { razorpayPaymentId: rzpPaymentId } });
        if (payment) await applyRefund(payment, refundEntity?.id);
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing error.' });
  }
};

// Admin: POST /api/admin/payments/:id/refund — full refund through Razorpay, then revoke access
const adminRefundPayment = async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment.status !== 'SUCCESS') {
      return res.status(400).json({ success: false, message: 'Only successful payments can be refunded.' });
    }
    if (!payment.razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'This payment has no Razorpay payment ID to refund.' });
    }
    let refund;
    try {
      refund = await getRazorpayInstance().payments.refund(payment.razorpayPaymentId, {
        amount: Math.round(Number(payment.amount) * 100),
        notes: { reason: String(req.body?.reason || 'Admin refund').slice(0, 200), adminId: req.user.id },
      });
    } catch (err) {
      const msg = err?.error?.description || err.message;
      return res.status(502).json({ success: false, message: `Razorpay refused the refund: ${msg}` });
    }
    await applyRefund(payment, refund?.id);
    res.json({ success: true, message: 'Refund issued and course access revoked.', data: { refundId: refund?.id } });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ success: false, message: 'Failed to refund payment.' });
  }
};

// GET /api/payments/history
const getPaymentHistory = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.id },
      include: { course: { select: { title: true, thumbnail: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payment history.' });
  }
};

// Admin: GET /api/admin/payments
const adminGetPayments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { status } = req.query;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true, username: true } },
          course: { select: { title: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};

module.exports = {
  createOrder, verifyPayment, webhook, getPaymentHistory, adminGetPayments, adminRefundPayment,
  completePayment, applyRefund, safeEqualHex,
};
