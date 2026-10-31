/**
 * Amazon SQS transport (opt-in: QUEUE_DRIVER=sqs). The database outbox stays the source of truth.
 *
 *   relay     claims due outbox events / email rows (same SKIP LOCKED claim the polling worker uses) and posts a small
 *             message {kind, id} to SQS. The row stays PROCESSING / SENDING.
 *   consumer  receives messages, performs the delivery (Operations call / SMTP send) and records the outcome on the row
 *             exactly as the polling worker does: SENT, or PENDING with exponential backoff, or DEAD / FAILED. The message
 *             is then deleted; the next attempt is re-posted by the relay when it falls due.
 *   dlq sweep reads the dead-letter queue (poison messages that crashed the consumer repeatedly, via the queue's redrive
 *             policy) and marks the matching row DEAD / FAILED so it shows up in the admin screens.
 *
 * Because retries live in the database, a lost SQS message cannot lose an event: a row stuck in PROCESSING / SENDING for
 * more than 10 minutes is claimed again by the relay. Delivery is at-least-once; Operations and the email table
 * deduplicate.
 *
 * Needs `@aws-sdk/client-sqs` installed (not a dependency yet) and AWS configuration - see deploy/aws/README.md.
 * Credentials come from the instance's IAM role; no access keys are read here.
 */
const prisma = require('../config/database');
const outbox = require('./outbox');
const emailService = require('./emailService');
const opsClient = require('./opsClient');
const logger = require('../config/logger');

let client;
const setClient = (c) => { client = c; };

/** Thin wrapper so the rest of the code (and the tests) never touch the AWS SDK directly. */
const getClient = () => {
  if (client) return client;
  let sdk;
  try {
    sdk = require('@aws-sdk/client-sqs');
  } catch {
    throw new Error('QUEUE_DRIVER=sqs needs the @aws-sdk/client-sqs package (npm install @aws-sdk/client-sqs).');
  }
  const sqs = new sdk.SQSClient({ region: process.env.AWS_REGION });
  client = {
    send: (QueueUrl, body) => sqs.send(new sdk.SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(body) })),
    receive: async (QueueUrl, { max = 10, wait = 5 } = {}) => (await sqs.send(new sdk.ReceiveMessageCommand({
      QueueUrl, MaxNumberOfMessages: max, WaitTimeSeconds: wait, AttributeNames: ['ApproximateReceiveCount'],
    }))).Messages || [],
    remove: (QueueUrl, ReceiptHandle) => sqs.send(new sdk.DeleteMessageCommand({ QueueUrl, ReceiptHandle })),
  };
  return client;
};

const urls = () => ({
  events: process.env.SQS_EVENTS_QUEUE_URL,
  email: process.env.SQS_EMAIL_QUEUE_URL,
  dlq: process.env.SQS_DLQ_URL,
});

// ---- relay: database -> SQS --------------------------------------------------------------------------------------------
const relayOutbox = async ({ limit = 25 } = {}) => {
  const q = urls().events;
  let n = 0;
  for (const ev of await outbox.claimDue(limit)) {
    try {
      await getClient().send(q, { kind: 'outbox', id: ev.id });
      n += 1;
    } catch (err) {
      // Could not enqueue: put it back with backoff (counts as an attempt)
      await outbox.markFailed(ev, { error: `sqs send failed: ${err.message}` });
    }
  }
  return n;
};

const relayEmails = async ({ limit = 25 } = {}) => {
  const q = urls().email;
  let n = 0;
  for (const log of await emailService.claimDue(limit)) {
    try {
      await getClient().send(q, { kind: 'email', id: log.id });
      n += 1;
    } catch (err) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'PENDING', lockedAt: null, lastError: `sqs send failed: ${err.message}`.slice(0, 500), nextAttemptAt: new Date(Date.now() + 60000) },
      });
    }
  }
  return n;
};

// ---- consumers: SQS -> delivery --------------------------------------------------------------------------------------
const handleOutbox = async (id, { deliver = opsClient.deliver } = {}) => {
  const ev = await prisma.outboxEvent.findUnique({ where: { id } });
  if (!ev || ev.status !== 'PROCESSING') return;   // already delivered / dead-lettered / duplicate message
  let result;
  try { result = await deliver(ev); } catch (err) { result = { ok: false, error: `unexpected: ${err.message}` }; }
  if (result.ok) await outbox.markSent(ev.id);
  else await outbox.markFailed(ev, { error: result.error, permanent: result.permanent });
};

const handleEmail = async (id) => {
  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log || log.status !== 'SENDING') return;
  await emailService.sendOne(log);
};

const consume = async (queueUrl, handler, { max = 10, wait = 1 } = {}) => {
  const c = getClient();
  let handled = 0;
  for (const m of await c.receive(queueUrl, { max, wait })) {
    let body;
    try { body = JSON.parse(m.Body); } catch { body = null; }
    if (body && body.id) await handler(body);   // a throw leaves the message for SQS to redeliver (and eventually dead-letter)
    await c.remove(queueUrl, m.ReceiptHandle);
    handled += 1;
  }
  return handled;
};

const consumeEvents = (opts) => consume(urls().events, (b) => handleOutbox(b.id, opts));
const consumeEmails = () => consume(urls().email, (b) => handleEmail(b.id));

// ---- dead-letter queue -----------------------------------------------------------------------------------------------
const sweepDlq = async () => {
  const q = urls().dlq;
  if (!q) return 0;
  const c = getClient();
  let n = 0;
  for (const m of await c.receive(q, { max: 10, wait: 1 })) {
    let body;
    try { body = JSON.parse(m.Body); } catch { body = null; }
    const note = 'Moved to the dead-letter queue after repeated processing failures';
    if (body?.kind === 'outbox') {
      await prisma.outboxEvent.updateMany({ where: { id: body.id, status: { not: 'SENT' } }, data: { status: 'DEAD', lockedAt: null, lastError: note } });
    } else if (body?.kind === 'email') {
      await prisma.emailLog.updateMany({ where: { id: body.id, status: { not: 'SENT' } }, data: { status: 'FAILED', lockedAt: null, lastError: note } });
    }
    logger.warn(`[sqs] dead-lettered message ${m.Body}`);
    await c.remove(q, m.ReceiptHandle);
    n += 1;
  }
  return n;
};

const enabled = () => (process.env.QUEUE_DRIVER || 'db') === 'sqs';

module.exports = { enabled, setClient, relayOutbox, relayEmails, consumeEvents, consumeEmails, sweepDlq, handleOutbox, handleEmail };
