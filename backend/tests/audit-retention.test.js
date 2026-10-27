const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const { installMockModule } = require('./helpers/mocks');

const DAY = 24 * 60 * 60 * 1000;
const db = {};
const prisma = {
  revokedToken: { deleteMany: async () => ({ count: 0 }) },
  studentImportJob: { updateMany: async () => ({ count: 0 }) },
  siteSettings: {
    findUnique: async ({ where }) => db.settings[where.key] || null,
    upsert: async ({ where, create }) => { db.settings[where.key] = { key: where.key, value: create.value }; },
  },
  auditLog: {
    count: async ({ where }) => db.logs.filter((l) => l < where.createdAt.lt).length,
    deleteMany: async ({ where }) => {
      const before = db.logs.length;
      db.logs = db.logs.filter((l) => l >= where.createdAt.lt);
      return { count: before - db.logs.length };
    },
  },
  user: { findMany: async () => [{ id: 'admin-1' }] },
  notification: { createMany: async ({ data }) => { db.alerts.push(...data); } },
};
installMockModule(require.resolve('../src/config/database'), prisma);

const { runCleanup } = require('../src/jobs/cleanup');

// Runs the job at a given time (the job reads the clock through `new Date()`)
const runAt = async (time) => {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  };
  try { await runCleanup(); } finally { global.Date = RealDate; }
};

describe('audit log retention', () => {
  const start = new Date('2026-11-01T00:00:00Z').getTime();
  beforeEach(() => {
    db.settings = {};
    db.alerts = [];
    // One entry per day for the last 30 days
    db.logs = Array.from({ length: 30 }, (_, i) => new Date(start - (i + 1) * DAY));
  });

  it('warns admins first and deletes nothing on the first run, even for very old entries', async () => {
    await runAt(start);
    assert.equal(db.alerts.length, 1);
    assert.equal(db.alerts[0].link, '/admin/audit-logs');
    assert.equal(db.logs.length, 30);
  });

  it('deletes announced entries three days after the warning, keeping the last two weeks', async () => {
    await runAt(start);
    await runAt(start + 1 * DAY); // between warnings: nothing announced long enough yet
    assert.equal(db.logs.length, 30);

    await runAt(start + 3 * DAY);
    assert.equal(db.alerts.length, 2);
    const oldest = Math.min(...db.logs.map((l) => l.getTime()));
    assert.ok(start + 3 * DAY - oldest <= 17 * DAY, 'nothing much older than two weeks is left');
    assert.ok(db.logs.every((l) => l >= new Date(start - 11 * DAY)), 'only entries announced at the first warning were removed');
    assert.ok(db.logs.some((l) => l < new Date(start + 3 * DAY - 11 * DAY)), 'entries announced by the second warning are kept for now');
  });
});
