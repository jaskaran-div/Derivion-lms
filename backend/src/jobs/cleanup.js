/**
 * Background cleanup jobs
 * - Purge expired revoked tokens (keeps revokedToken table lean)
 * - Import jobs older than 90 days (just result cleanup)
 * - Audit logs older than 14 days (admins are notified a few days before)
 */

const prisma = require('../config/database');
const { AUDIT_RETENTION_DAYS, AUDIT_WARNING_DAYS } = require('../controllers/auditController');
const { notifyUsers } = require('../services/notify');

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_ALERT_KEY = 'auditRetentionAlertAt';

const readAlerts = async () => {
  const row = await prisma.siteSettings.findUnique({ where: { key: AUDIT_ALERT_KEY } });
  try {
    const { latest, previous } = JSON.parse(row?.value || '{}');
    return { latest: latest ? new Date(latest) : null, previous: previous ? new Date(previous) : null };
  } catch {
    return { latest: null, previous: null };
  }
};

// Every AUDIT_WARNING_DAYS, tell admins how many entries will be deleted within the next AUDIT_WARNING_DAYS.
// Returns the purge cutoff: only entries that were already announced at least AUDIT_WARNING_DAYS ago are
// deleted, so nothing (including logs older than 14 days on the first run) disappears without notice.
const warnAdminsOfAuditPurge = async (now) => {
  let { latest, previous } = await readAlerts();
  const announcedCutoff = () =>
    previous ? new Date(Math.min(now - AUDIT_RETENTION_DAYS * DAY_MS, previous - (AUDIT_RETENTION_DAYS - AUDIT_WARNING_DAYS) * DAY_MS)) : null;

  if (latest && now - latest < AUDIT_WARNING_DAYS * DAY_MS) return announcedCutoff();

  const expiring = await prisma.auditLog.count({
    where: { createdAt: { lt: new Date(now - (AUDIT_RETENTION_DAYS - AUDIT_WARNING_DAYS) * DAY_MS) } },
  });
  if (!expiring) return announcedCutoff();

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  const by = new Date(now.getTime() + AUDIT_WARNING_DAYS * DAY_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  // In the app and by email, so the warning isn't missed
  await notifyUsers(admins.map((a) => a.id), {
    title: 'Audit logs will be deleted soon',
    message: `${expiring.toLocaleString('en-IN')} audit log entries are over ${AUDIT_RETENTION_DAYS - AUDIT_WARNING_DAYS} days old and will be deleted automatically by ${by}. Export them from Audit Logs if you need a copy.`,
    type: 'WARNING',
    link: '/admin/audit-logs',
  }, { email: true });
  // The alert sent now becomes "previous" at the next alert, which is when its entries may be purged
  previous = latest;
  latest = now;
  const value = JSON.stringify({ latest: latest.toISOString(), previous: previous ? previous.toISOString() : null });
  await prisma.siteSettings.upsert({
    where: { key: AUDIT_ALERT_KEY },
    create: { key: AUDIT_ALERT_KEY, value },
    update: { value },
  });
  return announcedCutoff();
};

const runCleanup = async () => {
  try {
    const now = new Date();

    // 1. Purge expired revoked tokens
    const { count: tokenCount } = await prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // 2. Purge old import job results (keep metadata, drop large results JSON after 30 days)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const { count: jobCount } = await prisma.studentImportJob.updateMany({
      where: {
        completedAt: { lt: thirtyDaysAgo },
        results: { not: null },
      },
      data: { results: null }, // clear large JSON payload but keep the job record
    });

    // 3. Audit logs: warn admins before entries age out, then purge the ones they were warned about
    const auditCutoff = await warnAdminsOfAuditPurge(now);
    const { count: auditCount } = auditCutoff
      ? await prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } })
      : { count: 0 };

    if (tokenCount > 0 || jobCount > 0 || auditCount > 0) {
      console.log(`[Cleanup] Purged ${tokenCount} expired tokens, cleared ${jobCount} old import results, deleted ${auditCount} old audit logs`);
    }
  } catch (err) {
    console.error('[Cleanup] Background cleanup error:', err.message);
  }
};

const startCleanupScheduler = () => {
  // Run immediately on startup, then every 6 hours
  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  console.log('[Cleanup] Background cleanup scheduler started (every 6h)');
};

module.exports = { startCleanupScheduler, runCleanup };
