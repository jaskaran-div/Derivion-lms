/**
 * Admin visibility and control over queued emails and Operations sync events.
 *   GET  /api/admin/emails?status=FAILED&search=...&page=1     list with delivery status
 *   POST /api/admin/emails/:id/retry                           re-queue a FAILED email
 *   GET  /api/admin/outbox?status=DEAD                         list sync events
 *   POST /api/admin/outbox/:id/retry                           re-queue a dead-lettered event
 */
const prisma = require('../config/database');
const emailService = require('../services/emailService');
const outbox = require('../services/outbox');
const { logAudit } = require('./auditController');

const page = (req) => {
  const p = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { p, limit, skip: (p - 1) * limit };
};

const listEmails = async (req, res) => {
  try {
    const { p, limit, skip } = page(req);
    const where = {};
    if (['PENDING', 'SENDING', 'SENT', 'FAILED'].includes(req.query.status)) where.status = req.query.status;
    if (req.query.search) where.toEmail = { contains: String(req.query.search), mode: 'insensitive' };
    const [total, rows, counts] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: {
          id: true, template: true, toEmail: true, subject: true, status: true, attempts: true, lastError: true,
          providerMessageId: true, sentAt: true, nextAttemptAt: true, createdAt: true, userId: true, enrollmentId: true,
        },
      }),
      prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    res.json({
      success: true,
      data: {
        emails: rows,
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        pagination: { page: p, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('List emails error:', error);
    res.status(500).json({ success: false, message: 'Failed to load emails.' });
  }
};

const retryEmail = async (req, res) => {
  try {
    const ok = await emailService.retry(req.params.id);
    if (!ok) return res.status(409).json({ success: false, message: 'Only failed emails can be retried.' });
    await logAudit({ userId: req.user.id, action: 'ADMIN_ACTION', targetId: req.params.id, targetType: 'email', details: { event: 'EMAIL_RETRY' }, req });
    res.json({ success: true, message: 'Email queued for another attempt.' });
  } catch (error) {
    console.error('Retry email error:', error);
    res.status(500).json({ success: false, message: 'Failed to retry email.' });
  }
};

const listOutbox = async (req, res) => {
  try {
    const { p, limit, skip } = page(req);
    const where = {};
    if (['PENDING', 'PROCESSING', 'SENT', 'DEAD'].includes(req.query.status)) where.status = req.query.status;
    const [total, rows, counts] = await Promise.all([
      prisma.outboxEvent.count({ where }),
      prisma.outboxEvent.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: { id: true, eventId: true, type: true, aggregateType: true, aggregateId: true, status: true, attempts: true, lastError: true, nextAttemptAt: true, sentAt: true, createdAt: true },
      }),
      prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    res.json({
      success: true,
      data: {
        events: rows,
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        pagination: { page: p, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('List outbox error:', error);
    res.status(500).json({ success: false, message: 'Failed to load sync events.' });
  }
};

const retryOutbox = async (req, res) => {
  try {
    const ok = await outbox.requeueDead(req.params.id);
    if (!ok) return res.status(409).json({ success: false, message: 'Only dead-lettered events can be retried.' });
    await logAudit({ userId: req.user.id, action: 'ADMIN_ACTION', targetId: req.params.id, targetType: 'outbox_event', details: { event: 'OUTBOX_RETRY' }, req });
    res.json({ success: true, message: 'Event queued for another attempt.' });
  } catch (error) {
    console.error('Retry outbox error:', error);
    res.status(500).json({ success: false, message: 'Failed to retry event.' });
  }
};

module.exports = { listEmails, retryEmail, listOutbox, retryOutbox };
