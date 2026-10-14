const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../config/database');
const { sendEmail, emailTemplates } = require('../config/email');
const { getCheckoutConfigurationId } = require('../utils/razorpayConfig');

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
  try {
    const { courseId } = req.body;
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
    if (existingEnrollment) {
      return res.status(409).json({ success: false, message: 'Already enrolled in this course.' });
    }

    // If free course, enroll directly
    if (course.isFree || parseFloat(course.price) === 0) {
      const enrollment = await prisma.enrollment.create({ data: { userId, courseId } });
      await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
      return res.json({ success: true, message: 'Enrolled successfully (free course).', data: { enrollment } });
    }

    const amount = parseFloat(course.discountPrice || course.price);
    const amountInPaise = Math.round(amount * 100);
    const checkoutConfigId = getCheckoutConfigurationId(course.emiEnabled);
    if (!checkoutConfigId) {
      return res.status(503).json({
        success: false,
        message: 'Payment checkout configuration is not available.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Initialize Razorpay
    const razorpay = getRazorpayInstance();

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
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create payment order.' });
  }
};

// POST /api/payments/verify
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId: fallbackOrderId,
    } = req.body;

    const rzpOrderId = razorpay_order_id || fallbackOrderId;
    const rzpPaymentId = razorpay_payment_id;
    const rzpSignature = razorpay_signature;

    if (!rzpOrderId) {
      return res.status(400).json({ success: false, message: 'Missing order ID.' });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { razorpayOrderId: rzpOrderId },
          { cashfreeOrderId: rzpOrderId },
          { id: rzpOrderId },
        ],
      },
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    // Verify signature if provided
    let isVerified = false;
    if (rzpPaymentId && rzpSignature) {
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${rzpOrderId}|${rzpPaymentId}`)
        .digest('hex');

      isVerified = generatedSignature === rzpSignature;
    } else {
      // Fallback: check Razorpay API for captured payments under this order
      try {
        const razorpay = getRazorpayInstance();
        const paymentsList = await razorpay.orders.fetchPayments(rzpOrderId);
        const captured = paymentsList.items?.find((p) => p.status === 'captured');
        if (captured) {
          isVerified = true;
        }
      } catch (err) {
        console.error('Fetch payments error during verification:', err);
      }
    }

    if (isVerified) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          razorpayPaymentId: rzpPaymentId || undefined,
          razorpaySignature: rzpSignature || undefined,
          gatewayResponse: { rzpOrderId, rzpPaymentId, rzpSignature },
        },
      });

      // Create enrollment if not exists
      const existing = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
      });

      if (!existing) {
        await prisma.enrollment.create({
          data: { userId: payment.userId, courseId: payment.courseId },
        });
        await prisma.course.update({
          where: { id: payment.courseId },
          data: { totalStudents: { increment: 1 } },
        });

        // Send enrollment confirmation email
        const [user, course] = await Promise.all([
          prisma.user.findUnique({ where: { id: payment.userId } }),
          prisma.course.findUnique({ where: { id: payment.courseId } }),
        ]);
        if (user && course && emailTemplates?.enrollmentConfirmation) {
          try {
            const { subject, html } = emailTemplates.enrollmentConfirmation(user.firstName, course.title);
            sendEmail({ to: user.email, subject, html });
          } catch (e) {
            console.error('Failed to send enrollment email:', e);
          }
        }

        // Create notification
        try {
          await prisma.notification.create({
            data: {
              userId: payment.userId,
              title: 'Course Enrollment Successful! 🎉',
              message: `You are now enrolled in "${course?.title || 'the course'}".`,
              type: 'SUCCESS',
              link: '/dashboard',
            },
          });
        } catch (e) {
          console.error('Failed to create notification:', e);
        }
      }

      return res.json({
        success: true,
        message: 'Payment verified. Enrollment activated.',
        data: { status: 'PAID' },
      });
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      return res.status(400).json({ success: false, message: 'Invalid payment signature or payment not captured.' });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment.' });
  }
};

// POST /api/payments/webhook - Razorpay webhook
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

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawPayload)
      .digest('hex');

    if (signature !== expectedSig) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
    }

    let parsedBody = req.body;
    if (Buffer.isBuffer(req.body)) {
      try {
        parsedBody = JSON.parse(req.body.toString('utf8'));
      } catch (parseErr) {
        return res.status(400).json({ success: false, message: 'Malformed JSON payload.' });
      }
    }

    const event = parsedBody?.event;
    const payload = parsedBody?.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || payload?.order?.entity?.id;

      if (orderId) {
        const payment = await prisma.payment.findFirst({
          where: {
            OR: [
              { razorpayOrderId: orderId },
              { cashfreeOrderId: orderId },
            ],
          },
        });

        if (payment && payment.status === 'PENDING') {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESS',
              razorpayPaymentId: paymentEntity?.id,
              gatewayResponse: payload,
            },
          });

          const existing = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
          });

          if (!existing) {
            await prisma.enrollment.create({
              data: { userId: payment.userId, courseId: payment.courseId },
            });
            await prisma.course.update({
              where: { id: payment.courseId },
              data: { totalStudents: { increment: 1 } },
            });
          }
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing error.' });
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
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = status ? { status } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
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
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};

module.exports = { createOrder, verifyPayment, webhook, getPaymentHistory, adminGetPayments };
