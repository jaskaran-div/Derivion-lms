const prisma = require('../config/database');
const { sendCSV } = require('../utils/csv');

// Audit entries are kept for two weeks; admins are warned a few days before entries are purged (see jobs/cleanup)
const AUDIT_RETENTION_DAYS = 14;
const AUDIT_WARNING_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Log an audit event — fire-and-forget, never throw.
 */
const logAudit = async ({ userId, action, targetId, targetType, details, req } = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        targetId: targetId || null,
        targetType: targetType || null,
        details: details || null,
        ipAddress: req ? (req.ip || req.headers['x-forwarded-for'] || null) : null,
        userAgent: req ? (req.headers['user-agent'] || null) : null,
      },
    });
  } catch (err) {
    // Audit failure must never break the main operation
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
};

// What a signed-in user did (opened a lesson, submitted a quiz, …). details.event names the action.
const logActivity = (req, event, { targetId, targetType, ...details } = {}) =>
  logAudit({ userId: req.user?.id, action: 'ACTIVITY', targetId, targetType, details: { event, ...details }, req });

const auditWhere = ({ action, userId, startDate, endDate, search, role }) => {
  const createdAt = {};
  if (startDate) createdAt.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    // A bare date means "through the end of that day"
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }
  const term = typeof search === 'string' ? search.trim() : '';
  return {
    ...(action && { action }),
    ...(userId && { userId }),
    ...(Object.keys(createdAt).length && { createdAt }),
    ...((term || role) && {
      user: {
        ...(role && { role }),
        ...(term && {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { username: { contains: term, mode: 'insensitive' } },
          ],
        }),
      },
    }),
  };
};

const userSelect = { id: true, firstName: true, lastName: true, email: true, username: true, role: true };

// GET /api/admin/audit-logs
const listAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = auditWhere(req.query);
    const expiringBefore = new Date(Date.now() - (AUDIT_RETENTION_DAYS - AUDIT_WARNING_DAYS) * DAY_MS);

    const [logs, total, expiringSoon] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: userSelect } },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { createdAt: { lt: expiringBefore } } }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        retention: { days: AUDIT_RETENTION_DAYS, warningDays: AUDIT_WARNING_DAYS, expiringSoon },
      },
    });
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
};

// One-line, human-readable summary of an entry's details
const describeDetails = (details) => {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('; ');
};

// GET /api/admin/audit-logs/export — CSV of the entries matching the current filters
const exportAuditLogs = async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: auditWhere(req.query),
      orderBy: { createdAt: 'desc' },
      take: 50000,
      include: { user: { select: userSelect } },
    });

    await logAudit({ userId: req.user.id, action: 'ADMIN_ACTION', details: { action: 'AUDIT_LOG_EXPORT', rows: logs.length }, req });

    sendCSV(
      res,
      `audit-logs_${new Date().toISOString().split('T')[0]}.csv`,
      ['Timestamp', 'User', 'Login ID / Email', 'Role', 'Action', 'Event', 'Target type', 'Target ID', 'Details', 'IP address', 'Device'],
      logs.map((l) => [
        l.createdAt.toISOString(),
        l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System',
        l.user ? (l.user.username || l.user.email) : '',
        l.user?.role || '',
        l.action,
        l.details?.event || '',
        l.targetType || '',
        l.targetId || '',
        describeDetails(l.details),
        l.ipAddress || '',
        l.userAgent || '',
      ])
    );
  } catch (error) {
    console.error('Audit log export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export audit logs.' });
  }
};

// POST /api/activity { event, path, label } — page visits and clicks reported by the app
const CLIENT_EVENTS = new Set(['PAGE_VIEW', 'CLICK', 'DOWNLOAD']);
const recordClientActivity = async (req, res) => {
  const event = String(req.body?.event || '').toUpperCase();
  if (!CLIENT_EVENTS.has(event)) return res.status(400).json({ success: false, message: 'Unknown activity.' });
  const clip = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  await logActivity(req, event, { path: clip(req.body.path, 300), label: clip(req.body.label, 200) });
  res.json({ success: true });
};

module.exports = {
  logAudit, logActivity, listAuditLogs, exportAuditLogs, recordClientActivity,
  AUDIT_RETENTION_DAYS, AUDIT_WARNING_DAYS,
};
