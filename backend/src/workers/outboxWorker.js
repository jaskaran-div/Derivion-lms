const outbox = require('../services/outbox');
const opsClient = require('../services/opsClient');
const { isEnabled } = require('../config/integration');

/**
 * Deliver due outbox events to Operations. Each event is retried with exponential backoff and dead-lettered after
 * MAX_ATTEMPTS (or immediately when Operations rejects the payload as invalid). Redelivery is harmless because
 * Operations deduplicates on event_id.
 * @returns {Promise<{sent: number, retry: number, dead: number}>}
 */
const processBatch = async ({ limit = 10, deliver = opsClient.deliver } = {}) => {
  const summary = { sent: 0, retry: 0, dead: 0 };
  if (!isEnabled()) return summary;

  const events = await outbox.claimDue(limit);
  for (const event of events) {
    let result;
    try {
      result = await deliver(event);
    } catch (err) {
      result = { ok: false, error: `unexpected: ${err.message}` };
    }
    if (result.ok) {
      await outbox.markSent(event.id);
      summary.sent += 1;
    } else {
      const updated = await outbox.markFailed(event, { error: result.error, permanent: result.permanent });
      summary[updated.status === 'DEAD' ? 'dead' : 'retry'] += 1;
    }
  }
  return summary;
};

module.exports = { processBatch };
