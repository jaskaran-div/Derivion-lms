/**
 * SQS transport against a real (disposable, local) PostgreSQL database and an in-memory fake of SQS.
 * Opt-in like learner-journey.e2e.test.js: set LMS_TEST_DATABASE_URL to a migrated, disposable local database.
 *
 * What this proves: the relay/consumer/dead-letter logic and its interaction with the database outbox.
 * What it cannot prove: behaviour of real Amazon SQS (permissions, redrive policy, visibility timeouts) - that needs the
 * AWS-side setup described in deploy/aws/README.md and a smoke test there.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const LMS_DB = process.env.LMS_TEST_DATABASE_URL;
const skip = LMS_DB ? false : 'set LMS_TEST_DATABASE_URL to run the SQS transport tests';
if (LMS_DB && !['127.0.0.1', 'localhost', '::1'].includes(new URL(LMS_DB).hostname)) throw new Error('Refusing to run against a non-local database');

/** In-memory SQS: standard-queue semantics (no visibility timeout, redelivery until deleted) plus a redrive policy. */
class FakeSqs {
  constructor(maxReceiveCount = 3) { this.queues = new Map(); this.maxReceiveCount = maxReceiveCount; this.failSends = false; }
  q(url) { if (!this.queues.has(url)) this.queues.set(url, []); return this.queues.get(url); }
  async send(url, body) {
    if (this.failSends) throw new Error('AccessDenied: not authorized to sqs:SendMessage');
    this.q(url).push({ MessageId: crypto.randomUUID(), Body: JSON.stringify(body), ReceiptHandle: crypto.randomUUID(), count: 0 });
  }
  async receive(url, { max = 10 } = {}) {
    const out = [];
    for (const m of [...this.q(url)]) {
      if (out.length >= max) break;
      m.count += 1;
      if (url !== process.env.SQS_DLQ_URL && m.count > this.maxReceiveCount) {   // redrive policy
        this.queues.set(url, this.q(url).filter((x) => x !== m));
        this.q(process.env.SQS_DLQ_URL).push({ ...m, count: 0 });
        continue;
      }
      out.push(m);
    }
    return out;
  }
  async remove(url, receipt) { this.queues.set(url, this.q(url).filter((m) => m.ReceiptHandle !== receipt)); }
  depth(url) { return this.q(url).length; }
}

describe('SQS transport', { skip }, () => {
  let prisma, outbox, emailService, sqs, transport, fake;
  const EVENTS = 'https://sqs.test/events';
  const EMAIL = 'https://sqs.test/email';
  const DLQ = 'https://sqs.test/dlq';
  const uid = () => crypto.randomBytes(4).toString('hex');

  const newEvent = async () => {
    const eventId = `test.event:${uid()}${uid()}`;
    await outbox.enqueue(prisma, { eventId, type: 'learner.verified', aggregateType: 'user', aggregateId: uid(), payload: { hello: 'world' } });
    return prisma.outboxEvent.findUnique({ where: { eventId } });
  };
  const newEmail = async () => {
    const key = `test.mail:${uid()}${uid()}`;
    await emailService.queue(prisma, { dedupeKey: key, template: 'onboarding-completed', to: `sqs-${uid()}@test.dev`, data: { firstName: 'S', courseTitle: 'C', courseUrl: '' } });
    return prisma.emailLog.findUnique({ where: { dedupeKey: key } });
  };

  before(async () => {
    process.env.DATABASE_URL = LMS_DB;
    process.env.DIRECT_URL = LMS_DB;
    Object.assign(process.env, {
      NODE_ENV: 'test', QUEUE_DRIVER: 'sqs', SQS_EVENTS_QUEUE_URL: EVENTS, SQS_EMAIL_QUEUE_URL: EMAIL, SQS_DLQ_URL: DLQ,
      OPERATIONS_API_URL: 'http://127.0.0.1:1', LMS_INTEGRATION_SECRET: 'x'.repeat(40), ONBOARDING_TOKEN_SECRET: 'y'.repeat(40), APP_NAME: 'Test',
    });
    const { PrismaClient } = require('@prisma/client');
    global.prisma = new PrismaClient({ datasources: { db: { url: LMS_DB } } });
    prisma = global.prisma;
    outbox = require('../src/services/outbox');
    emailService = require('../src/services/emailService');
    transport = require('../src/services/sqsTransport');
    sqs = emailService;   // alias used below for clarity
  });

  beforeEach(async () => {
    await prisma.$executeRaw`UPDATE outbox_events SET status = 'SENT'::"OutboxStatus" WHERE status <> 'SENT'::"OutboxStatus"`;
    await prisma.$executeRaw`UPDATE email_logs SET status = 'SENT'::"EmailStatus" WHERE status <> 'SENT'::"EmailStatus"`;
    fake = new FakeSqs(3);
    transport.setClient(fake);
  });

  after(async () => { if (prisma) await prisma.$disconnect(); });

  it('the driver is only active when QUEUE_DRIVER=sqs', () => {
    assert.equal(transport.enabled(), true);
    process.env.QUEUE_DRIVER = 'db';
    assert.equal(transport.enabled(), false);
    process.env.QUEUE_DRIVER = 'sqs';
  });

  it('events: relay posts a message, the consumer delivers it and marks the row SENT; the message is deleted', async () => {
    const ev = await newEvent();
    assert.equal(await transport.relayOutbox(), 1);
    assert.equal(fake.depth(EVENTS), 1);
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'PROCESSING');

    const delivered = [];
    await transport.consumeEvents({ deliver: async (e) => { delivered.push(e.eventId); return { ok: true }; } });
    assert.deepEqual(delivered, [ev.eventId]);
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'SENT');
    assert.equal(fake.depth(EVENTS), 0);
    assert.equal(await transport.relayOutbox(), 0, 'nothing left to relay');
  });

  it('events: a temporary failure schedules a backed-off retry in the database; the relay posts it again when due', async () => {
    const ev = await newEvent();
    await transport.relayOutbox();
    await transport.consumeEvents({ deliver: async () => ({ ok: false, error: 'network: ECONNREFUSED' }) });
    let row = await prisma.outboxEvent.findUnique({ where: { id: ev.id } });
    assert.equal(row.status, 'PENDING');
    assert.equal(row.attempts, 1);
    assert.match(row.lastError, /ECONNREFUSED/);
    assert.ok(row.nextAttemptAt > new Date());
    assert.equal(fake.depth(EVENTS), 0, 'the failed message is not left to spin in the queue');
    assert.equal(await transport.relayOutbox(), 0, 'not due yet');

    await prisma.outboxEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    assert.equal(await transport.relayOutbox(), 1);
    await transport.consumeEvents({ deliver: async () => ({ ok: true }) });
    row = await prisma.outboxEvent.findUnique({ where: { id: ev.id } });
    assert.equal(row.status, 'SENT');
    assert.equal(row.attempts, 2);
  });

  it('events: a permanently rejected payload is dead-lettered in the database straight away', async () => {
    const ev = await newEvent();
    await transport.relayOutbox();
    await transport.consumeEvents({ deliver: async () => ({ ok: false, error: '422 validation_error', permanent: true }) });
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'DEAD');
  });

  it('events: a duplicate message for an already-delivered event is ignored', async () => {
    const ev = await newEvent();
    await transport.relayOutbox();
    const [msg] = fake.q(EVENTS);
    await fake.send(EVENTS, JSON.parse(msg.Body));   // the same message arrives twice
    let calls = 0;
    await transport.consumeEvents({ deliver: async () => { calls += 1; return { ok: true }; } });
    assert.equal(calls, 1);
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'SENT');
    assert.equal(fake.depth(EVENTS), 0);
  });

  it('events: if SQS refuses the message the row goes back to PENDING with backoff (nothing is lost)', async () => {
    const ev = await newEvent();
    fake.failSends = true;
    assert.equal(await transport.relayOutbox(), 0);
    const row = await prisma.outboxEvent.findUnique({ where: { id: ev.id } });
    assert.equal(row.status, 'PENDING');
    assert.match(row.lastError, /sqs send failed: AccessDenied/);
    assert.ok(row.nextAttemptAt > new Date());
  });

  it('events: a message lost in transit is recovered because the row is re-claimed after the lock expires', async () => {
    const ev = await newEvent();
    await transport.relayOutbox();
    fake.queues.set(EVENTS, []);   // the message vanishes
    assert.equal(await transport.relayOutbox(), 0, 'still locked');
    await prisma.$executeRaw`UPDATE outbox_events SET "lockedAt" = ((now() AT TIME ZONE 'UTC') - interval '11 minutes') WHERE id = ${ev.id}`;
    assert.equal(await transport.relayOutbox(), 1, 're-posted');
    await transport.consumeEvents({ deliver: async () => ({ ok: true }) });
    assert.equal((await prisma.outboxEvent.findUnique({ where: { id: ev.id } })).status, 'SENT');
  });

  it('events: a poison message is moved to the dead-letter queue by the redrive policy and the row is marked DEAD', async () => {
    const ev = await newEvent();
    await transport.relayOutbox();
    // a consumer that keeps crashing receives the message but never deletes it
    for (let i = 0; i < 3; i += 1) await fake.receive(EVENTS);
    await fake.receive(EVENTS);   // the 4th receive exceeds maxReceiveCount: the queue redrives it
    assert.equal(fake.depth(EVENTS), 0);
    assert.equal(fake.depth(DLQ), 1);

    assert.equal(await transport.sweepDlq(), 1);
    const row = await prisma.outboxEvent.findUnique({ where: { id: ev.id } });
    assert.equal(row.status, 'DEAD');
    assert.match(row.lastError, /dead-letter queue/);
    assert.equal(fake.depth(DLQ), 0);
  });

  it('emails: relay + consumer send exactly once, record SENT, and a duplicate message does not resend', async () => {
    const log = await newEmail();
    const sent = [];
    emailService.setProvider({ name: 'fake', send: async (m) => { sent.push(m.to); return { messageId: 'id' }; } });
    assert.equal(await transport.relayEmails(), 1);
    const [msg] = fake.q(EMAIL);
    await fake.send(EMAIL, JSON.parse(msg.Body));
    await transport.consumeEmails();
    assert.deepEqual(sent, [log.toEmail]);
    assert.equal((await prisma.emailLog.findUnique({ where: { id: log.id } })).status, 'SENT');
    assert.equal(fake.depth(EMAIL), 0);
  });

  it('emails: an SMTP failure goes back to PENDING with backoff; a dead-lettered email is shown as FAILED', async () => {
    const log = await newEmail();
    emailService.setProvider({ name: 'fake', send: async () => { throw new Error('SMTP 421'); } });
    await transport.relayEmails();
    await transport.consumeEmails();
    const row = await prisma.emailLog.findUnique({ where: { id: log.id } });
    assert.equal(row.status, 'PENDING');
    assert.match(row.lastError, /SMTP 421/);

    const poison = await newEmail();
    await transport.relayEmails();
    for (let i = 0; i < 4; i += 1) await fake.receive(EMAIL);
    await transport.sweepDlq();
    assert.equal((await prisma.emailLog.findUnique({ where: { id: poison.id } })).status, 'FAILED');
    void sqs;
  });
});
