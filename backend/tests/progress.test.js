const assert = require('node:assert/strict');
const { beforeEach, describe, it } = require('node:test');
const { installMockModule, response } = require('./helpers/mocks');

// ---- in-memory fake of the Prisma calls used by progress tracking ----
const db = {};
const reset = () => {
  db.contents = [
    { id: 'v1', type: 'VIDEO', duration: 100, isPublished: true, section: { courseId: 'c1', isPublished: true } },
    { id: 'q1', type: 'QUIZ', duration: null, isPublished: true, section: { courseId: 'c1', isPublished: true } },
  ];
  db.enrollments = [];
  db.progress = [];
  db.certificates = [];
};
const countable = (where) => db.contents.filter((c) => c.isPublished && c.section.isPublished && c.section.courseId === where.section.courseId);

const prisma = {
  content: {
    findUnique: async ({ where }) => db.contents.find((c) => c.id === where.id) || null,
    count: async ({ where }) => countable(where).length,
  },
  enrollment: {
    findFirst: async ({ where }) => db.enrollments.find((e) => e.userId === where.userId && e.courseId === where.courseId && where.status.in.includes(e.status)) || null,
    update: async ({ where, data }) => Object.assign(db.enrollments.find((e) => e.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const rows = db.enrollments.filter((e) => e.userId === where.userId && e.courseId === where.courseId);
      rows.forEach((e) => Object.assign(e, data));
      return { count: rows.length };
    },
  },
  contentProgress: {
    findUnique: async ({ where }) => db.progress.find((p) => p.userId === where.userId_contentId.userId && p.contentId === where.userId_contentId.contentId) || null,
    upsert: async ({ where, update, create }) => {
      const existing = db.progress.find((p) => p.userId === where.userId_contentId.userId && p.contentId === where.userId_contentId.contentId);
      if (existing) return Object.assign(existing, update);
      db.progress.push({ ...create });
      return create;
    },
    count: async ({ where }) => {
      const ids = new Set(countable(where.content).map((c) => c.id));
      return db.progress.filter((p) => p.userId === where.userId && p.isCompleted && ids.has(p.contentId)).length;
    },
  },
  certificate: {
    findUnique: async ({ where }) => db.certificates.find((c) => c.userId === where.userId_courseId.userId && c.courseId === where.userId_courseId.courseId) || null,
    create: async ({ data }) => { const cert = { id: `cert${db.certificates.length + 1}`, ...data }; db.certificates.push(cert); return cert; },
  },
  course: { findUnique: async () => ({ title: 'Test course' }) },
  notification: { create: async () => ({}) },
};

installMockModule(require.resolve('../src/config/database'), prisma);
installMockModule(require.resolve('../src/config/aws'), { getPresignedDownloadUrl: async () => 'signed-url' });

const { updateProgress } = require('../src/controllers/contentController');
const { markLessonComplete } = require('../src/services/progress');

const call = async (contentId, body, userId = 'u1') => {
  const res = response();
  await updateProgress({ params: { id: contentId }, body, user: { id: userId, role: 'STUDENT' } }, res);
  return res;
};

describe('lesson progress and certificates', () => {
  beforeEach(reset);

  it('refuses progress from users who are not enrolled (no free certificates)', async () => {
    const res = await call('v1', { isCompleted: true });
    assert.equal(res.statusCode, 403);
    assert.equal(db.progress.length, 0);
    assert.equal(db.certificates.length, 0);
  });

  it('refuses progress on a refunded enrollment', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'REFUNDED' });
    const res = await call('v1', { isCompleted: true });
    assert.equal(res.statusCode, 403);
  });

  it('does not let a quiz lesson be ticked complete by hand', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'ACTIVE' });
    const res = await call('q1', { isCompleted: true });
    assert.equal(res.statusCode, 400);
    assert.equal(db.progress.length, 0);
  });

  it('caps reported watch time at the lesson length and never decreases it', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'ACTIVE' });
    await call('v1', { watchedSeconds: 5000 });
    assert.equal(db.progress[0].watchedSeconds, 100);
    await call('v1', { watchedSeconds: 10 });
    assert.equal(db.progress[0].watchedSeconds, 100);
  });

  it('issues the certificate only when every lesson, including the passed quiz, is complete', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'ACTIVE' });
    const first = await call('v1', { isCompleted: true });
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.data.certificateIssued, false);
    assert.equal(db.certificates.length, 0);

    // Passing the quiz completes its lesson on the server
    const result = await markLessonComplete('u1', 'q1', 'c1');
    assert.equal(result.completed, true);
    assert.equal(db.certificates.length, 1);
    assert.match(db.certificates[0].certificateNo, /^CERT-\d{4}-[0-9A-F]{8}$/);
    assert.equal(db.enrollments[0].status, 'COMPLETED');
  });

  it('keeps access after the course is completed', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'COMPLETED' });
    const res = await call('v1', { watchedSeconds: 20 });
    assert.equal(res.statusCode, 200);
  });

  it('issues at most one certificate per learner and course', async () => {
    db.enrollments.push({ id: 'e1', userId: 'u1', courseId: 'c1', status: 'ACTIVE' });
    await markLessonComplete('u1', 'v1', 'c1');
    await markLessonComplete('u1', 'q1', 'c1');
    await markLessonComplete('u1', 'q1', 'c1');
    assert.equal(db.certificates.length, 1);
  });
});
