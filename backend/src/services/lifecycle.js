/**
 * Learner lifecycle: what the LMS records (transactionally) when a learner is verified, pays, fails to pay, is
 * refunded, or finishes onboarding. Everything here is a no-op while the integration is not configured, so the
 * platform behaves exactly as before until the environment variables are set.
 *
 * Who is synchronized to Operations ("eligible"): an ACTIVE STUDENT whose email is real, syntactically valid and
 * VERIFIED. Placeholder addresses (teacher-created / bulk-imported learners) and unverified accounts are never sent.
 * The LMS user id is the permanent external identifier, so a learner can never be duplicated.
 */
const crypto = require('crypto');
const prisma = require('../config/database');
const { isEnabled, sweepEnabled } = require('../config/integration');
const { isPlaceholderEmail } = require('../utils/credentials');
const outbox = require('./outbox');
const emailService = require('./emailService');
const invoices = require('./invoices');
const onboardingTokens = require('./onboardingTokens');

// ---- eligibility -------------------------------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESERVED_DOMAINS = new Set(['example.com', 'example.org', 'example.net']);
const RESERVED_TLDS = new Set(['invalid', 'localhost', 'local', 'internal']);

/** A syntactically valid address that is not an LMS placeholder or a reserved/documentation domain. */
const isRealEmail = (email) => {
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email) || isPlaceholderEmail(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return !RESERVED_DOMAINS.has(domain) && !RESERVED_TLDS.has(domain.split('.').pop());
};

const eligible = (user) => Boolean(
  user && user.role === 'STUDENT' && user.isActive !== false && user.isEmailVerified === true && isRealEmail(user.email)
);

const learnerPayload = (user) => ({
  lms_user_id: user.id,
  first_name: user.firstName,
  last_name: user.lastName || null,
  email: user.email,
  phone: user.phone || null,
  registered_at: new Date(user.createdAt || Date.now()).toISOString(),
  registration_source: user.createdById ? 'staff_created' : 'lms',
  email_verified: true,
});

// ---- learner synchronization -------------------------------------------------------------------------------------
/** The learner is verified: announce them to Operations. `db` may be a transaction client. */
const onLearnerVerified = async (db, user, { catchUp = 'recent' } = {}) => {
  if (!isEnabled() || !eligible(user)) return false;
  const queued = await outbox.enqueue(db, {
    eventId: `learner.verified:${user.id}`,
    type: 'learner.verified',
    aggregateType: 'user',
    aggregateId: user.id,
    payload: learnerPayload(user),
  });
  // Enrollments created while the learner was not yet eligible (e.g. an admin enrolled an unverified account)
  if (queued && catchUp) await catchUpEnrollments(db, user, catchUp);
  return queued;
};

/**
 * Identity details (name, phone, email) of an already-synchronized learner changed. The event id includes a hash of the
 * payload, so a repeated save with the same values is ignored while a real change produces a new event.
 */
const onLearnerUpdated = async (db, user) => {
  if (!isEnabled() || !eligible(user)) return false;
  const synced = await db.outboxEvent.findUnique({ where: { eventId: `learner.verified:${user.id}` }, select: { id: true } });
  if (!synced) return onLearnerVerified(db, user);   // never announced yet: announce with the latest details
  const payload = learnerPayload(user);
  delete payload.registered_at;
  const digest = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return outbox.enqueue(db, {
    eventId: `learner.updated:${user.id}:${digest}`,
    type: 'learner.updated',
    aggregateType: 'user',
    aggregateId: user.id,
    payload: { ...payload, registered_at: new Date(user.createdAt).toISOString() },
  });
};

/**
 * Reconciliation: finds eligible learners that were never announced and announces them. This covers every account
 * creation path uniformly - self-registration, admin-created, teacher-created, bulk-imported - including an account
 * that started with a placeholder address and later received a real, verified one, and learners who existed before the
 * integration was switched on.
 * @returns {Promise<number>} how many learners were queued
 */
const sweepUnsyncedLearners = async ({ limit = 100 } = {}) => {
  if (!isEnabled() || !sweepEnabled()) return 0;   // historical backfill is opt-in (LEARNER_SYNC_SWEEP)
  const rows = await prisma.$queryRaw`
    SELECT u.id FROM users u
    WHERE u.role = 'STUDENT'::"Role" AND u."isActive" = true AND u."isEmailVerified" = true
      AND u.email NOT LIKE '%@students.derivion.local'
      AND NOT EXISTS (SELECT 1 FROM outbox_events o WHERE o."eventId" = 'learner.verified:' || u.id)
    ORDER BY u."createdAt"
    LIMIT ${limit}`;
  if (!rows.length) return 0;
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  let queued = 0;
  // Backfill only announces the learner and their existing enrollments; it never sends onboarding emails
  for (const user of users) if (await onLearnerVerified(prisma, user, { catchUp: 'sync-only' })) queued += 1;
  return queued;
};

// ---- purchases ---------------------------------------------------------------------------------------------------
const courseDetails = (course) => [
  course.level,
  course.language,
  course.totalLessons ? `${course.totalLessons} lessons` : null,
].filter(Boolean).join(' · ') || (course.shortDesc || '').slice(0, 160);

const auditTx = (tx, data) => tx.auditLog.create({ data }).catch((e) => console.error('[Audit]', e.message));

const baseEmailData = (user, course, payment, enrollment, invoice) => ({
  firstName: user.firstName,
  courseTitle: course.title,
  courseDetails: courseDetails(course),
  enrollmentId: enrollment.id,
  amount: Number(payment.amount),
  currency: payment.currency || 'INR',
  paymentReference: payment.razorpayPaymentId || payment.razorpayOrderId || null,
  invoiceId: invoice.id,
});

/**
 * A payment was verified and its enrollment exists. Everything below happens inside the payment transaction, and each
 * artefact has a uniqueness key derived from the payment, so nothing is ever created twice.
 *
 *  - first purchase of a course            -> invoice, onboarding link, sync event, purchase+onboarding email
 *  - same learner, another course          -> the same, for the NEW enrollment only; general onboarding is untouched
 *  - re-purchase after a refund            -> as above, but if onboarding for that enrollment is already complete it is kept
 *    (confirmation email without a link)
 *  - duplicate payment for a course the learner is already enrolled in -> invoice + confirmation email + audit entry only:
 *    no second enrollment, no new link, onboarding status unchanged, nothing sent to Operations
 *
 * `previous` is the enrollment row as it was BEFORE this payment (null when it was just created).
 */
const onPaymentSucceeded = async (tx, { payment, user, course, enrollment, previous }) => {
  if (!isEnabled() || !eligible(user)) return null;

  const invoice = await invoices.createForPayment(tx, { payment, user, course, enrollmentId: enrollment.id });
  const data = baseEmailData(user, course, payment, enrollment, invoice);
  const restored = Boolean(previous && previous.status === 'REFUNDED');
  const duplicate = Boolean(previous && !restored && previous.onboardingStatus !== 'NOT_APPLICABLE');
  const onboardingDone = enrollment.onboardingStatus === 'ONBOARDING_COMPLETED';

  await auditTx(tx, {
    userId: user.id, action: 'PAYMENT_VERIFIED', targetId: payment.id, targetType: 'payment',
    details: { courseId: course.id, enrollmentId: enrollment.id, invoice: invoice.invoiceNumber, kind: duplicate ? 'duplicate' : restored ? 'restored' : 'new' },
  });

  if (duplicate) {
    await emailService.queue(tx, {
      dedupeKey: `purchase-confirmation:${payment.id}`, template: 'purchase-confirmation', to: user.email,
      userId: user.id, enrollmentId: enrollment.id, data: { ...data, duplicate: true },
    });
    return { invoice, duplicate: true };
  }

  const needsOnboarding = !(restored && onboardingDone);
  let tokenRow = null;
  if (needsOnboarding) {
    ({ row: tokenRow } = await onboardingTokens.issue(tx, enrollment.id));
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { onboardingStatus: 'ONBOARDING_PENDING', onboardingCompletedAt: null } });
  }

  await outbox.enqueue(tx, {
    eventId: `payment.successful:${payment.id}`,
    type: 'payment.successful',
    aggregateType: 'enrollment',
    aggregateId: enrollment.id,
    payload: {
      lms_enrollment_id: enrollment.id,
      lms_user_id: user.id,
      lms_course_id: course.id,
      course_name: course.title,
      payment_status: 'SUCCESS',
      enrollment_status: 'ACTIVE',
      amount: Number(payment.amount),
      currency: payment.currency || 'INR',
      payment_reference: data.paymentReference,
      invoice_number: invoice.invoiceNumber,
      enrolled_at: new Date(enrollment.enrolledAt || Date.now()).toISOString(),
      ...(tokenRow && { onboarding_token_hash: tokenRow.tokenHash, onboarding_token_expires_at: tokenRow.expiresAt.toISOString() }),
      // Lets Operations create or refresh the learner even if the earlier learner event has not arrived yet
      learner: learnerPayload(user),
    },
  });

  // A learner who already finished general onboarding for another course only confirms their details here
  const earlier = await tx.enrollment.count({
    where: { userId: user.id, id: { not: enrollment.id }, onboardingStatus: 'ONBOARDING_COMPLETED' },
  });
  await emailService.queue(tx, {
    dedupeKey: needsOnboarding ? `purchase-onboarding:${payment.id}` : `purchase-confirmation:${payment.id}`,
    template: needsOnboarding ? 'purchase-onboarding' : 'purchase-confirmation',
    to: user.email,
    userId: user.id,
    enrollmentId: enrollment.id,
    data: { ...data, ...(tokenRow && { tokenRowId: tokenRow.id }), returning: earlier > 0 },
  });
  return { invoice, tokenRow };
};

/** Razorpay reported a failed payment attempt. Idempotent per payment. */
const onPaymentFailed = async (tx, { payment, user, course, reason }) => {
  if (!isEnabled() || !eligible(user)) return false;
  await outbox.enqueue(tx, {
    eventId: `payment.failed:${payment.id}`,
    type: 'payment.failed',
    aggregateType: 'payment',
    aggregateId: payment.id,
    payload: { lms_user_id: user.id, lms_course_id: payment.courseId, payment_reference: payment.razorpayOrderId, reason: reason || null },
  });
  await auditTx(tx, { userId: user.id, action: 'ACTIVITY', targetId: payment.id, targetType: 'payment', details: { event: 'PAYMENT_FAILED', reason: reason || null } });
  return emailService.queue(tx, {
    dedupeKey: `payment-failed:${payment.id}`, template: 'payment-failed', to: user.email, userId: user.id,
    data: {
      firstName: user.firstName, courseTitle: course?.title || 'your course',
      amount: Number(payment.amount), currency: payment.currency || 'INR', reason: reason || '',
      retryUrl: course?.slug ? `${process.env.APP_URL || ''}/courses/${course.slug}` : (process.env.APP_URL || ''),
    },
  });
};

/** A payment was refunded: tell Operations and email the learner (each once per payment). */
const onPaymentRefunded = async (tx, { payment, user, course, enrollmentId }) => {
  if (!isEnabled() || !enrollmentId) return false;
  await outbox.enqueue(tx, {
    eventId: `payment.refunded:${payment.id}`,
    type: 'payment.refunded',
    aggregateType: 'enrollment',
    aggregateId: enrollmentId,
    payload: { lms_enrollment_id: enrollmentId, payment_status: 'REFUNDED' },
  });
  await auditTx(tx, { userId: user?.id || payment.userId, action: 'ACTIVITY', targetId: payment.id, targetType: 'payment', details: { event: 'PAYMENT_REFUNDED_SYNC', enrollmentId } });
  if (!eligible(user)) return true;
  await emailService.queue(tx, {
    dedupeKey: `refund:${payment.id}`, template: 'refund-confirmation', to: user.email, userId: user.id, enrollmentId,
    data: {
      firstName: user.firstName, courseTitle: course?.title || 'your course',
      amount: Number(payment.amount), currency: payment.currency || 'INR',
      paymentReference: payment.razorpayPaymentId || payment.razorpayOrderId || null, refundId: payment.refundId || null,
    },
  });
  return true;
};

/** Operations reported the onboarding form as submitted: confirm to the learner once. */
const onOnboardingCompleted = async (tx, { user, course, enrollment }) => {
  if (!isEnabled() || !eligible(user)) return false;
  return emailService.queue(tx, {
    dedupeKey: `onboarding-completed:${enrollment.id}`, template: 'onboarding-completed', to: user.email, userId: user.id, enrollmentId: enrollment.id,
    data: { firstName: user.firstName, courseTitle: course?.title || 'your course', courseUrl: course?.slug ? `${process.env.APP_URL || ''}/courses/${course.slug}` : '' },
  });
};


// ---- free and manually created enrollments (no payment, no invoice) --------------------------------------------------
// Paid enrollments go through onPaymentSucceeded. Everything else - a free course, or an enrollment made by an admin, a
// teacher or a bulk import - goes through here. The distinction is explicit in the event: payment_status NOT_APPLICABLE,
// no amount, no invoice number.
const SOURCE_LABEL = { free: 'Free course', admin: 'Added by Derivion', teacher: 'Added by your school', bulk: 'Added by your school' };
const CATCH_UP_DAYS = 30;

/**
 * Announce one non-paid enrollment to Operations (once: the event id is derived from the enrollment).
 * mode 'full'      -> also issue a personal onboarding link and queue the onboarding email
 * mode 'sync-only' -> history only: Operations records the enrollment, marked "onboarding not required", and nobody is emailed
 */
const onEnrollmentCreated = async (db, { user, course, enrollment, source, mode = 'full' }) => {
  if (!isEnabled() || !eligible(user) || !course || enrollment.status === 'REFUNDED') return null;
  const handled = await db.outboxEvent.count({
    where: { aggregateType: 'enrollment', aggregateId: enrollment.id, type: { in: ['enrollment.created', 'payment.successful'] } },
  });
  if (handled) return null;

  let tokenRow = null;
  const full = mode === 'full';
  if (full) {
    ({ row: tokenRow } = await onboardingTokens.issue(db, enrollment.id));
    await db.enrollment.update({ where: { id: enrollment.id }, data: { onboardingStatus: 'ONBOARDING_PENDING', onboardingCompletedAt: null } });
  }

  await outbox.enqueue(db, {
    eventId: `enrollment.created:${enrollment.id}`,
    type: 'enrollment.created',
    aggregateType: 'enrollment',
    aggregateId: enrollment.id,
    payload: {
      lms_enrollment_id: enrollment.id,
      lms_user_id: user.id,
      lms_course_id: course.id,
      course_name: course.title,
      payment_status: 'NOT_APPLICABLE',
      enrollment_status: enrollment.status,
      enrollment_source: source,
      onboarding_required: full,
      enrolled_at: new Date(enrollment.enrolledAt || Date.now()).toISOString(),
      ...(tokenRow && { onboarding_token_hash: tokenRow.tokenHash, onboarding_token_expires_at: tokenRow.expiresAt.toISOString() }),
      learner: learnerPayload(user),
    },
  });
  await auditTx(db, {
    userId: user.id, action: 'ENROLLMENT_CREATED', targetId: enrollment.id, targetType: 'enrollment',
    details: { source, courseId: course.id, mode, payment: 'none' },
  });

  if (full) {
    const earlier = await db.enrollment.count({ where: { userId: user.id, id: { not: enrollment.id }, onboardingStatus: 'ONBOARDING_COMPLETED' } });
    await emailService.queue(db, {
      dedupeKey: `enrollment-onboarding:${enrollment.id}`, template: 'enrollment-onboarding', to: user.email, userId: user.id, enrollmentId: enrollment.id,
      data: {
        firstName: user.firstName, courseTitle: course.title, courseDetails: courseDetails(course), enrollmentId: enrollment.id,
        sourceLabel: SOURCE_LABEL[source] || 'Added by Derivion', free: source === 'free', returning: earlier > 0, tokenRowId: tokenRow.id,
      },
    });
  }
  return { tokenRow };
};

/**
 * Call right after a non-paid enrollment row was created (free course, admin, teacher, bulk). Never throws: a problem here
 * must not break enrolling someone; the recent-enrollment sweep below picks up anything missed.
 */
const afterEnrollmentCreated = async ({ userId, courseId, source }) => {
  if (!isEnabled()) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const [user, course, enrollment] = await Promise.all([
        tx.user.findUnique({ where: { id: userId } }),
        tx.course.findUnique({ where: { id: courseId } }),
        tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
      ]);
      if (!user || !enrollment) return null;
      return onEnrollmentCreated(tx, { user, course, enrollment, source });
    });
  } catch (err) {
    console.error('[lifecycle] enrollment sync not queued:', err.message);
    return null;
  }
};

/** The learner just became eligible: sync what they were already enrolled in (recent ones also get the onboarding email). */
const catchUpEnrollments = async (db, user, mode) => {
  const enrollments = await db.enrollment.findMany({ where: { userId: user.id, status: { not: 'REFUNDED' } }, include: { course: true } });
  for (const e of enrollments) {
    const recent = Date.now() - new Date(e.enrolledAt).getTime() < CATCH_UP_DAYS * 86400000;
    await onEnrollmentCreated(db, { user, course: e.course, enrollment: e, source: 'admin', mode: mode === 'recent' && recent ? 'full' : 'sync-only' });
  }
};

/**
 * Safety net for non-paid enrollments of eligible learners that have no event yet.
 *  - enrollments from the last 7 days AND after the integration was first switched on: always checked (covers a failed hook); full flow
 *  - older ones: only when the historical sweep is enabled (LEARNER_SYNC_SWEEP); sync-only
 */
/**
 * When the integration was first active. Enrollments made before that moment are history: they are only ever synchronized
 * by the opt-in backfill, never emailed, so switching the integration on cannot surprise anyone who enrolled earlier.
 */
const integrationStart = async () => {
  const key = 'integrationStartedAt';
  let row = await prisma.siteSettings.findUnique({ where: { key } });
  if (!row) {
    try { row = await prisma.siteSettings.create({ data: { key, value: new Date().toISOString() } }); }
    catch { row = await prisma.siteSettings.findUnique({ where: { key } }); }   // another worker won the race
  }
  return new Date(row.value);
};

const sweepUnsyncedEnrollments = async ({ limit = 100 } = {}) => {
  if (!isEnabled()) return 0;
  const recentFrom = new Date(Math.max(Date.now() - 7 * 86400000, (await integrationStart()).getTime()));
  const historical = sweepEnabled();
  const rows = await prisma.$queryRaw`
    SELECT e.id FROM enrollments e
    JOIN users u ON u.id = e."userId"
    WHERE e.status <> 'REFUNDED'::"EnrollmentStatus" AND u.role = 'STUDENT'::"Role" AND u."isActive" = true AND u."isEmailVerified" = true
      AND u.email NOT LIKE '%@students.derivion.local'
      AND NOT EXISTS (SELECT 1 FROM outbox_events o WHERE o."aggregateType" = 'enrollment' AND o."aggregateId" = e.id
                      AND o.type IN ('enrollment.created', 'payment.successful'))
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p."userId" = e."userId" AND p."courseId" = e."courseId" AND p.status = 'SUCCESS'::"PaymentStatus")
      AND (${historical} OR e."enrolledAt" >= ${recentFrom})
    ORDER BY e."enrolledAt"
    LIMIT ${limit}`;
  let queued = 0;
  for (const { id } of rows) {
    await prisma.$transaction(async (tx) => {
      const e = await tx.enrollment.findUnique({ where: { id }, include: { user: true, course: true } });
      if (!e) return;
      const isRecent = e.enrolledAt >= recentFrom;
      const r = await onEnrollmentCreated(tx, { user: e.user, course: e.course, enrollment: e, source: 'admin', mode: isRecent ? 'full' : 'sync-only' });
      if (r) queued += 1;
    });
  }
  return queued;
};

// ---- onboarding reminders (off unless ONBOARDING_REMINDER_DAYS is set, e.g. "3,7") ---------------------------------
const reminderDays = () => String(process.env.ONBOARDING_REMINDER_DAYS || '')
  .split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => d > 0).sort((a, b) => a - b);

/**
 * Queue a reminder for learners whose onboarding is still pending. At most one reminder is queued per run per
 * enrollment (the latest schedule step that is due), each step only once, and only while the link is still valid.
 */
const queueOnboardingReminders = async ({ limit = 100 } = {}) => {
  const days = reminderDays();
  if (!isEnabled() || days.length === 0) return 0;
  const now = Date.now();
  const candidates = await prisma.enrollment.findMany({
    where: {
      onboardingStatus: 'ONBOARDING_PENDING', status: 'ACTIVE',
      enrolledAt: { lte: new Date(now - days[0] * 86400000) },
      onboardingTokens: { some: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } },
    },
    include: { user: true, course: true, onboardingTokens: { where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { enrolledAt: 'asc' },
    take: limit,
  });
  let queued = 0;
  for (const e of candidates) {
    if (!eligible(e.user)) continue;
    const ageDays = (now - e.enrolledAt.getTime()) / 86400000;
    const step = days.reduce((last, d, i) => (ageDays >= d ? i : last), -1);
    if (step < 0) continue;
    const ok = await emailService.queue(prisma, {
      dedupeKey: `onboarding-reminder:${e.id}:${step}`, template: 'onboarding-reminder', to: e.user.email, userId: e.userId, enrollmentId: e.id,
      data: { firstName: e.user.firstName, courseTitle: e.course.title, tokenRowId: e.onboardingTokens[0].id },
    });
    if (ok) queued += 1;
  }
  return queued;
};

module.exports = {
  isRealEmail, eligible, learnerPayload,
  onLearnerVerified, onLearnerUpdated, sweepUnsyncedLearners,
  onEnrollmentCreated, afterEnrollmentCreated, sweepUnsyncedEnrollments,
  onPaymentSucceeded, onPaymentFailed, onPaymentRefunded, onOnboardingCompleted,
  queueOnboardingReminders,
};
