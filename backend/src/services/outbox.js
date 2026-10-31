/**
 * Transactional outbox. Rows are written inside the same database transaction as the change they describe,
 * so an event can never be lost (or announced for a change that rolled back). A worker delivers them later.
 */
const prisma = require('../config/database');

/**
 * Queue an event. `eventId` must be deterministic for the business fact (e.g. `payment.successful:<paymentId>`):
 * queueing the same fact twice is silently ignored. Pass a transaction client as `db` to join its transaction.
 * @returns {Promise<boolean>} true when a new row was created
 */
const enqueue = async (db, { eventId, type, aggregateType, aggregateId, payload }) => {
  const { count } = await db.outboxEvent.createMany({
    data: [{ eventId, type, aggregateType, aggregateId: String(aggregateId), payload }],
    skipDuplicates: true,
  });
  return count === 1;
};

const BASE_DELAY_MS = 30 * 1000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Exponential backoff with +/-10% jitter: 30s, 1m, 2m, 4m ... capped at 6h
const backoffMs = (attempts) => {
  const base = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
  return Math.round(base * (0.9 + Math.random() * 0.2));
};

// Prisma stores DateTime as `timestamp` (no zone) holding UTC. Raw SQL must therefore compare against
// (now() AT TIME ZONE 'UTC'), never bare now(), or the result would depend on the database session's time zone.
/**
 * Atomically claim up to `limit` due events (safe with several workers: SKIP LOCKED).
 * The attempt counter is incremented at claim time, so a worker crash still counts as an attempt.
 * Rows stuck in PROCESSING for over 10 minutes (crashed worker) are picked up again.
 */
const byAge = (rows) => rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
const claimDue = async (limit = 10) => byAge(await prisma.$queryRaw`
  UPDATE outbox_events SET status = 'PROCESSING'::"OutboxStatus", "lockedAt" = (now() AT TIME ZONE 'UTC'), attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM outbox_events
    WHERE (status = 'PENDING'::"OutboxStatus" AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC'))
       OR (status = 'PROCESSING'::"OutboxStatus" AND "lockedAt" < (now() AT TIME ZONE 'UTC') - interval '10 minutes')
    ORDER BY "createdAt"
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *`);

const markSent = (id) => prisma.outboxEvent.update({
  where: { id },
  data: { status: 'SENT', sentAt: new Date(), lockedAt: null, lastError: null },
});

/** Schedule a retry, or dead-letter the event when it is permanently rejected or out of attempts. */
const markFailed = (event, { error, permanent = false }) => {
  const dead = permanent || event.attempts >= MAX_ATTEMPTS;
  return prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: dead ? 'DEAD' : 'PENDING',
      lockedAt: null,
      lastError: String(error).slice(0, 500),
      nextAttemptAt: dead ? event.nextAttemptAt : new Date(Date.now() + backoffMs(event.attempts)),
    },
  });
};

/** Admin: put a dead-lettered event back in the queue with a fresh attempt budget. */
const requeueDead = async (id) => {
  const { count } = await prisma.outboxEvent.updateMany({
    where: { id, status: 'DEAD' },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lockedAt: null },
  });
  return count === 1;
};

module.exports = { enqueue, claimDue, markSent, markFailed, requeueDead, backoffMs, MAX_ATTEMPTS };
