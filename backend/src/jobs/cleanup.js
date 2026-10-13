/**
 * Background cleanup jobs
 * - Purge expired revoked tokens (keeps revokedToken table lean)
 * - Import jobs older than 90 days (just result cleanup)
 */

const prisma = require('../config/database');

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

    if (tokenCount > 0 || jobCount > 0) {
      console.log(`[Cleanup] Purged ${tokenCount} expired tokens, cleared ${jobCount} old import results`);
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
