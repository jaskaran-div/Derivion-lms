/**
 * Inbound, HMAC-authenticated endpoint used by Operations:  POST /api/integrations/operations/events
 *   { event_id, type: "onboarding.completed", occurred_at, data: { lms_enrollment_id, lms_user_id, completed_at } }
 * Redelivery of the same event_id is acknowledged without side effects.
 */
const crypto = require('crypto');
const prisma = require('../config/database');
const { secrets } = require('../config/integration');
const { sign } = require('../utils/integrationSigner');
const lifecycle = require('../services/lifecycle');
const emailService = require('../services/emailService');

const MAX_SKEW_SECONDS = 300;
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

/** Verifies timestamp window, signature (current or previous secret) and one-time nonce. */
const authenticate = async (req, res, next) => {
  const candidates = secrets();
  if (candidates.length === 0) return fail(res, 503, 'integration_disabled', 'Integration is not configured.');

  const timestamp = req.get('X-Integration-Timestamp') || '';
  const nonce = req.get('X-Integration-Nonce') || '';
  const signature = req.get('X-Integration-Signature') || '';
  if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) {
    return fail(res, 401, 'unauthorized', 'Invalid or missing request signature.');
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > MAX_SKEW_SECONDS) {
    return fail(res, 401, 'unauthorized', 'Invalid or missing request signature.');
  }

  const parts = { timestamp, nonce, method: req.method, path: req.originalUrl, body: req.rawBody || Buffer.alloc(0) };
  const given = Buffer.from(signature, 'hex');
  const ok = candidates.some((secret) => crypto.timingSafeEqual(Buffer.from(sign(secret, parts), 'hex'), given));
  if (!ok) return fail(res, 401, 'unauthorized', 'Invalid or missing request signature.');

  try {
    // Only authenticated requests may write nonces; a reused nonce is a replay
    await prisma.integrationNonce.create({ data: { nonce } });
    if (Math.random() < 0.02) {
      prisma.integrationNonce.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } } }).catch(() => {});
    }
    return next();
  } catch (err) {
    if (err.code === 'P2002') return fail(res, 401, 'unauthorized', 'Invalid or missing request signature.');
    return next(err);
  }
};

const handleOnboardingCompleted = async (tx, data) => {
  const enrollmentId = String(data.lms_enrollment_id || '');
  const enrollment = enrollmentId && await tx.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || (data.lms_user_id && enrollment.userId !== String(data.lms_user_id))) {
    const err = new Error('Enrollment not found for this learner.');
    err.status = 404;
    throw err;
  }
  const completedAt = data.completed_at && !Number.isNaN(new Date(data.completed_at).getTime()) ? new Date(data.completed_at) : new Date();
  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: { onboardingStatus: 'ONBOARDING_COMPLETED', onboardingCompletedAt: completedAt },
  });
  await tx.onboardingToken.updateMany({ where: { enrollmentId: enrollment.id, usedAt: null }, data: { usedAt: completedAt } });
  const [user, course] = await Promise.all([
    tx.user.findUnique({ where: { id: enrollment.userId } }),
    tx.course.findUnique({ where: { id: enrollment.courseId }, select: { title: true, slug: true } }),
  ]);
  await lifecycle.onOnboardingCompleted(tx, { user, course, enrollment });
  await tx.auditLog.create({
    data: { userId: enrollment.userId, action: 'ACTIVITY', targetId: enrollment.id, targetType: 'enrollment', details: { event: 'ONBOARDING_COMPLETED', source: 'operations', enrollmentNo: data.enrollment_no || null } },
  });
  await tx.notification.create({
    data: {
      userId: enrollment.userId,
      title: 'Onboarding complete',
      message: `Thanks! Your onboarding for "${course?.title || 'your course'}" has been received.`,
      type: 'SUCCESS',
      link: course ? `/courses/${course.slug}` : null,
    },
  });
};

const receiveEvent = async (req, res) => {
  const body = req.body || {};
  const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(eventId) || !/^[a-z_]{2,40}\.[a-z_]{2,40}$/.test(type) || typeof body.data !== 'object' || !body.data) {
    return fail(res, 422, 'validation_error', 'event_id, type and data are required.');
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // The unique eventId makes concurrent/repeated deliveries collapse to exactly one processing
      const claimed = await tx.inboundEvent.createMany({
        data: [{ eventId, type, payload: { occurred_at: body.occurred_at || null, data: body.data } }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return 'duplicate';
      if (type === 'onboarding.completed') {
        await handleOnboardingCompleted(tx, body.data);
        return 'processed';
      }
      return 'ignored';
    });
    return res.json({ status: outcome, event_id: eventId });
  } catch (err) {
    if (err.status === 404) return fail(res, 404, 'enrollment_not_found', err.message);
    console.error('Inbound integration event failed:', err);
    return fail(res, 500, 'internal_error', 'Internal error.');
  }
};

// GET /api/integrations/operations/ping - lets Operations show whether the LMS is reachable and the secret matches
const ping = (req, res) => res.json({ ok: true, service: 'lms', time: new Date().toISOString() });

// POST /api/integrations/operations/emails/:id/retry - the Operations dashboard asks the LMS to re-send a FAILED email
const retryEmail = async (req, res) => {
  try {
    const ok = await emailService.retry(req.params.id);
    if (!ok) return fail(res, 409, 'not_retryable', 'Only failed emails can be retried.');
    await prisma.auditLog.create({ data: { action: 'ADMIN_ACTION', targetId: req.params.id, targetType: 'email', details: { event: 'EMAIL_RETRY', via: 'operations' } } });
    return res.json({ status: 'queued' });
  } catch (err) {
    console.error('Retry email (operations) failed:', err);
    return fail(res, 500, 'internal_error', 'Internal error.');
  }
};

module.exports = { authenticate, receiveEvent, ping, retryEmail };
