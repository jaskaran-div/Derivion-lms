/**
 * Centralised, queued, trackable email delivery.
 *
 *  - queue(): inserts an EmailLog row (PENDING). The same dedupeKey can never be queued twice.
 *  - processBatch(): the email worker's unit of work. Claims due rows (PENDING -> SENDING), renders the template,
 *    sends through the active provider, and records SENT or schedules a retry; after the last attempt the row is FAILED.
 *  - retry(): admin action that puts a FAILED email back in the queue. A SENT email can never be retried.
 *
 * Statuses: PENDING -> SENDING -> SENT | (back to PENDING with backoff) | FAILED.
 */
const prisma = require('../config/database');
const { config, isEnabled } = require('../config/integration');
const invoices = require('./invoices');
const onboardingTokens = require('./onboardingTokens');
const outbox = require('./outbox');
const L = require('./emailLayout');

const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS, 10) || 5;
const BASE_DELAY_MS = 60 * 1000;

// ---- provider selection (swappable; tests inject a fake) ---------------------------------------------------------
let provider;
const getProvider = () => provider || (provider = require(`./emailProviders/${process.env.EMAIL_PROVIDER || 'smtp'}`));
const setProvider = (p) => { provider = p; };

// ---- templates ---------------------------------------------------------------------------------------------------
const longDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const money = (d) => invoices.formatMoney(d.amount, d.currency);
const greeting = (firstName) => L.paragraph(`Hi ${firstName || 'there'},`);
const courseBlock = (d, tone = 'success') => L.callout(d.courseTitle, d.courseDetails || '', tone);
const invoiceAttachment = (invoice, pdf) => [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }];
const onboardingBlock = (url) => L.button(url, 'Complete onboarding') + L.linkFallback(url);

/** Each template knows how to turn its stored data into subject/html/attachments. */
const BUILDERS = {
  'purchase-onboarding': async (log) => {
    const d = log.data;
    const [{ invoice, pdf }, tokenRow] = await Promise.all([
      invoices.getPdf(d.invoiceId),
      prisma.onboardingToken.findUnique({ where: { id: d.tokenRowId } }),
    ]);
    if (!tokenRow) throw new Error('Onboarding token for this email no longer exists');
    const url = onboardingTokens.linkFor(tokenRow);
    const intro = d.returning
      ? 'We already have your details from your earlier enrollment, so this will only take a minute: review them and answer the few course-specific questions.'
      : 'Please complete a short onboarding form so our team can set you up. Details we already know are filled in for you.';
    const html = L.render(
      L.heading('Payment confirmed')
      + greeting(d.firstName)
      + L.paragraph('Thank you for enrolling. Your payment was received and your place in the course is confirmed.')
      + courseBlock(d)
      + L.details([
        ['Enrollment ID', d.enrollmentId],
        ['Amount paid', money(d)],
        ['Payment status', 'Paid'],
        ['Payment reference', d.paymentReference || '—'],
        ['Invoice', `${invoice.invoiceNumber} (PDF attached)`],
      ])
      + L.subheading('Next step: complete your onboarding')
      + L.paragraph(intro)
      + onboardingBlock(url)
      + L.paragraph(`This personal link is valid until ${longDate(tokenRow.expiresAt)} and can be submitted once. Please do not share it.`, { muted: true, small: true })
      + L.paragraph('You can start learning right away from your dashboard.'),
      { preheader: `Your payment for ${d.courseTitle} is confirmed. One more step: complete your onboarding.`, reason: `You received this email because you purchased a course on ${config().appName}.` },
    );
    return { subject: `Payment confirmed: ${d.courseTitle} — complete your onboarding`, html, attachments: invoiceAttachment(invoice, pdf) };
  },

  // Payment confirmation without an onboarding step: onboarding already done for this enrollment, or a duplicate payment
  'purchase-confirmation': async (log) => {
    const d = log.data;
    const { invoice, pdf } = await invoices.getPdf(d.invoiceId);
    const html = L.render(
      L.heading(d.duplicate ? 'Additional payment received' : 'Payment confirmed')
      + greeting(d.firstName)
      + L.paragraph(d.duplicate
        ? 'We received an additional payment for a course you are already enrolled in. Your enrollment and onboarding are unchanged. If you did not intend to pay twice, please contact us and we will help.'
        : 'Your payment was received. We already have your onboarding details for this course, so there is nothing more to complete.')
      + courseBlock(d, d.duplicate ? 'warning' : 'success')
      + L.details([
        ['Enrollment ID', d.enrollmentId],
        ['Amount paid', money(d)],
        ['Payment status', 'Paid'],
        ['Payment reference', d.paymentReference || '—'],
        ['Invoice', `${invoice.invoiceNumber} (PDF attached)`],
      ]),
      { preheader: `We received your payment for ${d.courseTitle}. Your invoice is attached.`, reason: 'You received this email because a payment was made on your account.' },
    );
    return {
      subject: d.duplicate ? `Additional payment received: ${d.courseTitle}` : `Payment confirmed: ${d.courseTitle}`,
      html,
      attachments: invoiceAttachment(invoice, pdf),
    };
  },

  'refund-confirmation': async (log) => {
    const d = log.data;
    const html = L.render(
      L.heading('Your refund has been processed')
      + greeting(d.firstName)
      + L.paragraph('Your refund has been processed and access to this course has been removed. The amount normally reaches your original payment method within 5–7 working days, depending on your bank.')
      + L.callout(d.courseTitle, '', 'info')
      + L.details([
        ['Refunded amount', money(d)],
        ['Payment reference', d.paymentReference || '—'],
        ['Refund reference', d.refundId],
      ]),
      { preheader: `Your refund for ${d.courseTitle} has been processed.`, reason: 'You received this email because a refund was issued on your account.' },
    );
    return { subject: `Refund processed: ${d.courseTitle}`, html };
  },

  'payment-failed': async (log) => {
    const d = log.data;
    const html = L.render(
      L.heading('Your payment did not go through')
      + greeting(d.firstName)
      + L.paragraph('Your payment could not be completed. If an amount was debited, your bank will normally reverse it automatically within a few working days.')
      + L.callout(d.courseTitle, '', 'warning')
      + L.details([['Amount', money(d)], ['Reason', d.reason]])
      + (d.retryUrl ? L.button(d.retryUrl, 'Try again') : ''),
      { preheader: `Your payment for ${d.courseTitle} could not be completed.`, reason: 'You received this email because a payment attempt on your account did not succeed.' },
    );
    return { subject: `Your payment for ${d.courseTitle} did not go through`, html };
  },

  // Enrollment without a payment (free course, or added by Derivion / the school): no amount, no invoice
  'enrollment-onboarding': async (log) => {
    const d = log.data;
    const tokenRow = await prisma.onboardingToken.findUnique({ where: { id: d.tokenRowId } });
    if (!tokenRow) throw new Error('Onboarding token for this email no longer exists');
    const url = onboardingTokens.linkFor(tokenRow);
    const html = L.render(
      L.heading(d.free ? 'You are enrolled' : 'You have been enrolled')
      + greeting(d.firstName)
      + L.paragraph((d.free ? 'You are now enrolled in this free course. ' : 'You have been enrolled in this course. ')
        + (d.returning
          ? 'We already have your details from your earlier enrollment, so onboarding only takes a minute: review them and answer the few course-specific questions.'
          : 'Please complete a short onboarding form so our team can set you up. Details we already know are filled in for you.'))
      + courseBlock(d)
      + L.details([
        ['Enrollment ID', d.enrollmentId],
        ['Enrollment type', d.sourceLabel],
        ['Payment', 'No payment required'],
        ['Link valid until', longDate(tokenRow.expiresAt)],
      ])
      + onboardingBlock(url)
      + L.paragraph('This personal link can be submitted once. Please do not share it.', { muted: true, small: true }),
      { preheader: `You are enrolled in ${d.courseTitle}. Complete your onboarding to get set up.`, reason: 'You received this email because you were enrolled in a course.' },
    );
    return {
      subject: d.free ? `You are enrolled: ${d.courseTitle} — complete your onboarding` : `You have been enrolled: ${d.courseTitle} — complete your onboarding`,
      html,
    };
  },

  'onboarding-completed': async (log) => {
    const d = log.data;
    const html = L.render(
      L.heading('Onboarding received')
      + greeting(d.firstName)
      + L.paragraph('Thank you. We have received your onboarding details for this course and our team will review them. You can continue learning at any time.')
      + L.callout(d.courseTitle, '', 'success')
      + (d.courseUrl ? L.button(d.courseUrl, 'Go to your course') : ''),
      { preheader: `We have received your onboarding details for ${d.courseTitle}.`, reason: 'You received this email because you completed onboarding for a course.' },
    );
    return { subject: `Onboarding received: ${d.courseTitle}`, html };
  },

  'onboarding-reminder': async (log) => {
    const d = log.data;
    const tokenRow = await prisma.onboardingToken.findUnique({ where: { id: d.tokenRowId } });
    if (!tokenRow || tokenRow.usedAt || tokenRow.revokedAt || tokenRow.expiresAt < new Date()) {
      const err = new Error('Onboarding link is no longer valid; reminder skipped');
      err.skip = true;
      throw err;
    }
    const url = onboardingTokens.linkFor(tokenRow);
    const html = L.render(
      L.heading('A quick reminder')
      + greeting(d.firstName)
      + L.paragraph(`Please complete your onboarding so our team can finish setting you up. Your personal link is valid until ${longDate(tokenRow.expiresAt)}.`)
      + courseBlock(d, 'info')
      + onboardingBlock(url),
      { preheader: `Complete your onboarding for ${d.courseTitle}.`, reason: 'You received this email because your onboarding for a course is still pending.' },
    );
    return { subject: `Reminder: complete your onboarding for ${d.courseTitle}`, html };
  },
};

// ---- queue -------------------------------------------------------------------------------------------------------
/** Queue an email. `db` may be a transaction client. Returns true when newly queued, false when the dedupeKey already existed. */
const queue = async (db, { dedupeKey, template, to, userId = null, enrollmentId = null, data = {} }) => {
  if (!BUILDERS[template]) throw new Error(`Unknown email template "${template}"`);
  const { count } = await db.emailLog.createMany({
    data: [{ dedupeKey, template, toEmail: to, userId, enrollmentId, data }],
    skipDuplicates: true,
  });
  return count === 1;
};

// ---- worker ------------------------------------------------------------------------------------------------------
const claimDue = async (limit) => (await prisma.$queryRaw`
  UPDATE email_logs SET status = 'SENDING'::"EmailStatus", "lockedAt" = (now() AT TIME ZONE 'UTC'), attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM email_logs
    WHERE (status = 'PENDING'::"EmailStatus" AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC'))
       OR (status = 'SENDING'::"EmailStatus" AND "lockedAt" < (now() AT TIME ZONE 'UTC') - interval '10 minutes')
    ORDER BY "createdAt"
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *`).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));   // RETURNING has no guaranteed order: send oldest first

const messageIdFor = (log) => `<${log.dedupeKey.replace(/[^A-Za-z0-9._-]/g, '-')}.${log.id}@email.derivion>`;

// Tell Operations how an email ended (SENT / FAILED) so its dashboard can show delivery history. Best effort.
const announce = async (log, status, error, subject) => {
  if (!isEnabled()) return;
  try {
    await outbox.enqueue(prisma, {
      eventId: `email.status:${log.id}:${status}`,
      type: 'email.status',
      aggregateType: 'email',
      aggregateId: log.id,
      payload: {
        external_ref: log.id, template: log.template, recipient: log.toEmail, subject: subject || log.subject || null,
        status, error: error || null, lms_user_id: log.userId || null, lms_enrollment_id: log.enrollmentId || null,
        occurred_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error('[email] could not queue status event:', e.message);
  }
};

const sendOne = async (log) => {
  try {
    const build = BUILDERS[log.template];
    if (!build) throw new Error(`Unknown email template "${log.template}"`);
    const message = await build(log);
    const result = await getProvider().send({ to: log.toEmail, ...message, messageId: messageIdFor(log) });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date(), subject: message.subject, providerMessageId: result?.messageId || null, lockedAt: null, lastError: null },
    });
    await announce(log, 'SENT', null, message.subject);
    return 'sent';
  } catch (err) {
    const exhausted = log.attempts >= MAX_ATTEMPTS || err.skip === true;
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        lockedAt: null,
        lastError: String(err.message || err).slice(0, 500),
        nextAttemptAt: exhausted ? undefined : new Date(Date.now() + BASE_DELAY_MS * 2 ** (log.attempts - 1)),
      },
    });
    if (exhausted) await announce(log, 'FAILED', String(err.message || err).slice(0, 300));
    return exhausted ? 'failed' : 'retry';
  }
};

/** Process up to `limit` due emails, one at a time (gentle on SMTP rate limits). */
const processBatch = async ({ limit = 10 } = {}) => {
  const claimed = await claimDue(limit);
  const summary = { sent: 0, retry: 0, failed: 0 };
  for (const log of claimed) summary[await sendOne(log)] += 1;
  return summary;
};

/** Admin: re-queue a FAILED email with a fresh attempt budget. SENT/PENDING/SENDING emails are left alone. */
const retry = async (id) => {
  const { count } = await prisma.emailLog.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lockedAt: null },
  });
  return count === 1;
};

module.exports = { queue, processBatch, retry, setProvider, getProvider, claimDue, sendOne, MAX_ATTEMPTS, BUILDERS };
