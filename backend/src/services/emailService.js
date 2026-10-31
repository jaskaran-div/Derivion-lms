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
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { config } = require('../config/integration');
const invoices = require('./invoices');
const onboardingTokens = require('./onboardingTokens');
const outbox = require('./outbox');
const { isEnabled } = require('../config/integration');

const TEMPLATE_DIR = path.join(__dirname, '../templates/email');
const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS, 10) || 5;
const BASE_DELAY_MS = 60 * 1000;

// ---- provider selection (swappable; tests inject a fake) ---------------------------------------------------------
let provider;
const getProvider = () => provider || (provider = require(`./emailProviders/${process.env.EMAIL_PROVIDER || 'smtp'}`));
const setProvider = (p) => { provider = p; };

// ---- templates ---------------------------------------------------------------------------------------------------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// {{name}} is HTML-escaped; {{{name}}} is inserted as-is and is only ever used for markup produced by this file
const fill = (html, vars) => html
  .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => String(vars[k] ?? ''))
  .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k]));
const loadTemplate = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8');

const longDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** Each template knows how to turn its stored data into subject/html/attachments. */
const BUILDERS = {
  'purchase-onboarding': async (log) => {
    const d = log.data;
    const [{ invoice, pdf }, tokenRow] = await Promise.all([
      invoices.getPdf(d.invoiceId),
      prisma.onboardingToken.findUnique({ where: { id: d.tokenRowId } }),
    ]);
    if (!tokenRow) throw new Error('Onboarding token for this email no longer exists');
    const c = config();
    const vars = {
      appName: c.appName,
      firstName: d.firstName,
      courseTitle: d.courseTitle,
      courseDetails: d.courseDetails,
      enrollmentRef: d.enrollmentId,
      amount: invoices.formatMoney(d.amount, d.currency),
      paymentStatus: 'Paid',
      paymentReference: d.paymentReference || '—',
      invoiceNumber: invoice.invoiceNumber,
      onboardingUrl: onboardingTokens.linkFor(tokenRow),
      expiresOn: longDate(tokenRow.expiresAt),
      onboardingIntro: d.returning
        ? 'We already have your details from your earlier enrollment, so this will only take a minute: review them and answer the few course-specific questions.'
        : 'Please complete a short onboarding form so our team can set you up. Details we already know are filled in for you.',
      supportLine: c.supportEmail ? `Questions? Write to ${c.supportEmail}.` : '',
    };
    return {
      subject: `Payment confirmed: ${d.courseTitle} — complete your onboarding`,
      html: fill(loadTemplate('purchase-onboarding'), vars),
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
    };
  },
};


// ---- templates that share the standard layout --------------------------------------------------------------------
const money = (d) => invoices.formatMoney(d.amount, d.currency);
const row = (label, value) => `<tr><td style="padding:7px 0;color:#6b7280;border-top:1px solid #eef0f3;">${esc(label)}</td><td style="padding:7px 0;text-align:right;font-weight:600;border-top:1px solid #eef0f3;">${esc(value)}</td></tr>`;
const button = (url, label) => `<p style="text-align:center;margin:18px 0;"><a href="${esc(url)}" style="display:inline-block;background:#0f1115;color:#ffffff;padding:13px 30px;border-radius:999px;text-decoration:none;font-weight:600;">${esc(label)}</a></p>`;

const withLayout = (name, vars) => fill(loadTemplate('layout'), { ...vars, content: fill(loadTemplate(name), vars) });

const common = () => {
  const c = config();
  return { appName: c.appName, supportLine: c.supportEmail ? `Questions? Write to ${c.supportEmail}.` : '' };
};

const SIMPLE = {
  // Payment confirmation without an onboarding step: onboarding already done for this enrollment, or a duplicate payment
  'purchase-confirmation': async (log) => {
    const d = log.data;
    const { invoice, pdf } = await invoices.getPdf(d.invoiceId);
    return {
      subject: d.duplicate ? `Additional payment received: ${d.courseTitle}` : `Payment confirmed: ${d.courseTitle}`,
      vars: {
        firstName: d.firstName, courseTitle: d.courseTitle, courseDetails: d.courseDetails,
        intro: d.duplicate
          ? 'We received an additional payment for a course you are already enrolled in. Your enrollment and onboarding are unchanged. If you did not intend to pay twice, please contact us and we will help.'
          : 'Your payment was received. We already have your onboarding details for this course, so there is nothing more to complete.',
        details: row('Enrollment ID', d.enrollmentId) + row('Amount paid', money(d)) + row('Payment status', 'Paid')
          + row('Payment reference', d.paymentReference || '—') + row('Invoice', `${invoice.invoiceNumber} (attached PDF)`),
        action: '',
      },
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
    };
  },
  'refund-confirmation': async (log) => {
    const d = log.data;
    return {
      subject: `Refund processed: ${d.courseTitle}`,
      vars: {
        firstName: d.firstName, courseTitle: d.courseTitle, courseDetails: '',
        intro: 'Your refund has been processed and access to this course has been removed. The amount normally reaches your original payment method within 5–7 working days, depending on your bank.',
        details: row('Refunded amount', money(d)) + row('Payment reference', d.paymentReference || '—') + (d.refundId ? row('Refund reference', d.refundId) : ''),
        action: '',
      },
    };
  },
  'payment-failed': async (log) => {
    const d = log.data;
    return {
      subject: `Your payment for ${d.courseTitle} did not go through`,
      vars: {
        firstName: d.firstName, courseTitle: d.courseTitle, courseDetails: '',
        intro: 'Your payment could not be completed. If an amount was debited, your bank will normally reverse it automatically within a few working days.',
        details: row('Amount', money(d)) + (d.reason ? row('Reason', d.reason) : ''),
        action: d.retryUrl ? button(d.retryUrl, 'Try again') : '',
      },
    };
  },
  'onboarding-completed': async (log) => {
    const d = log.data;
    return {
      subject: `Onboarding received: ${d.courseTitle}`,
      vars: {
        firstName: d.firstName, courseTitle: d.courseTitle, courseDetails: '',
        intro: 'Thank you. We have received your onboarding details for this course and our team will review them. You can continue learning at any time.',
        details: '',
        action: d.courseUrl ? button(d.courseUrl, 'Go to your course') : '',
      },
    };
  },
  'onboarding-reminder': async (log) => {
    const d = log.data;
    const tokenRow = await prisma.onboardingToken.findUnique({ where: { id: d.tokenRowId } });
    if (!tokenRow || tokenRow.usedAt || tokenRow.revokedAt || tokenRow.expiresAt < new Date()) {
      const err = new Error('Onboarding link is no longer valid; reminder skipped');
      err.skip = true;
      throw err;
    }
    return {
      subject: `Reminder: complete your onboarding for ${d.courseTitle}`,
      vars: {
        firstName: d.firstName, courseTitle: d.courseTitle, courseDetails: '',
        intro: `A quick reminder to complete your onboarding. Your personal link is valid until ${longDate(tokenRow.expiresAt)}.`,
        details: '',
        action: button(onboardingTokens.linkFor(tokenRow), 'Complete onboarding'),
      },
    };
  },
};

for (const [name, make] of Object.entries(SIMPLE)) {
  BUILDERS[name] = async (log) => {
    const { vars, ...rest } = await make(log);
    return { ...rest, html: withLayout('simple', { ...common(), ...vars }) };
  };
}

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

module.exports = { queue, processBatch, retry, setProvider, getProvider, claimDue, sendOne, MAX_ATTEMPTS };
