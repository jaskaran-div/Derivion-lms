/**
 * Background worker process:  node src/workers/index.js
 * Run it separately from the web server (own PM2 process) so slow SMTP or an unreachable Operations never
 * blocks a learner's request. Safe to run more than once: rows are claimed with FOR UPDATE SKIP LOCKED.
 */
require('dotenv').config();
const outboxWorker = require('./outboxWorker');
const emailService = require('../services/emailService');
const { isEnabled } = require('../config/integration');
const lifecycle = require('../services/lifecycle');
const sqsTransport = require('../services/sqsTransport');
const logger = require('../config/logger');

const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS, 10) || 5000;
const HOUSEKEEPING_MS = parseInt(process.env.WORKER_HOUSEKEEPING_MS, 10) || 60 * 1000;
let stopping = false;
let timer;
let lastHousekeeping = 0;

// Slower jobs, about once a minute: catch-up announcements (learner backfill is opt-in) and due onboarding reminders
const housekeeping = async () => {
  if (Date.now() - lastHousekeeping < HOUSEKEEPING_MS) return;
  lastHousekeeping = Date.now();
  const learners = await lifecycle.sweepUnsyncedLearners();          // no-op unless LEARNER_SYNC_SWEEP is on
  const enrollments = await lifecycle.sweepUnsyncedEnrollments();    // always covers the last 7 days; older only if the sweep is on
  const reminders = await lifecycle.queueOnboardingReminders();
  if (learners || enrollments || reminders) {
    logger.info(`[worker] queued ${learners} learner(s), ${enrollments} enrollment(s) and ${reminders} onboarding reminder(s)`);
  }
};

const tick = async () => {
  try {
    await housekeeping();
    let out;
    let mail;
    if (sqsTransport.enabled()) {
      // SQS mode: post due rows to the queues, deliver what comes back, and mark dead-lettered messages
      await sqsTransport.relayOutbox();
      await sqsTransport.relayEmails();
      await sqsTransport.consumeEvents();
      await sqsTransport.consumeEmails();
      await sqsTransport.sweepDlq();
      out = {}; mail = {};
    } else {
      out = await outboxWorker.processBatch();
      mail = await emailService.processBatch();
    }
    if (out.sent || out.retry || out.dead || mail.sent || mail.retry || mail.failed) {
      logger.info(`[worker] outbox ${JSON.stringify(out)} email ${JSON.stringify(mail)}`);
    }
  } catch (err) {
    logger.error(`[worker] batch failed: ${err.message}`);
  } finally {
    if (!stopping) timer = setTimeout(tick, INTERVAL_MS);
  }
};

const shutdown = (signal) => {
  logger.info(`[worker] ${signal} received, finishing current batch`);
  stopping = true;
  clearTimeout(timer);
  setTimeout(() => process.exit(0), 3000).unref();
};

if (require.main === module) {
  logger.info(`[worker] started (integration ${isEnabled() ? 'ENABLED' : 'disabled - outbox delivery paused, emails still send'})`);
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  tick();
}

module.exports = { tick };
