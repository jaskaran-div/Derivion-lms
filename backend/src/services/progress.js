/**
 * Course progress, completion and certificate issuing — the single place these rules live.
 */
const crypto = require('crypto');
const prisma = require('../config/database');
const { notifyUser } = require('./notify');

// Enrollment states that grant access to course content
const ACCESS_STATUSES = ['ACTIVE', 'COMPLETED'];

const getActiveEnrollment = (userId, courseId) =>
  prisma.enrollment.findFirst({ where: { userId, courseId, status: { in: ACCESS_STATUSES } } });

// Only published lessons in published sections count towards progress
const countableLessons = (courseId) => ({ isPublished: true, section: { courseId, isPublished: true } });

const newCertificateNo = () =>
  `CERT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const issueCertificate = async (userId, courseId) => {
  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cert = await prisma.certificate.create({ data: { userId, courseId, certificateNo: newCertificateNo() } });
      const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true } });
      // Also emailed (to the learner and their guardian)
      await notifyUser(userId, {
        title: 'Certificate earned!',
        message: `You completed "${course?.title || 'your course'}". Your certificate is ready to download.`,
        type: 'SUCCESS',
        link: '/certificates',
      }, { email: true }).catch(() => {});
      return cert;
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // Unique clash: either the cert was just created concurrently, or a number collision — retry
      const raced = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
      if (raced) return raced;
    }
  }
  return null;
};

// Recalculate a learner's progress in a course; completes the enrollment and issues the certificate at 100%
const recomputeCourseProgress = async (userId, courseId) => {
  const [total, completed] = await Promise.all([
    prisma.content.count({ where: countableLessons(courseId) }),
    prisma.contentProgress.count({ where: { userId, isCompleted: true, content: countableLessons(courseId) } }),
  ]);
  const progressPercent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const done = total > 0 && completed >= total;

  await prisma.enrollment.updateMany({
    where: { userId, courseId, status: { in: ACCESS_STATUSES } },
    data: {
      progressPercent,
      lastAccessedAt: new Date(),
      ...(done ? { status: 'COMPLETED', completedAt: new Date() } : {}),
    },
  });

  const certificate = done ? await issueCertificate(userId, courseId) : null;
  return { progressPercent, completed: done, certificate };
};

// Mark one lesson complete for a learner (idempotent) and refresh course progress
const markLessonComplete = async (userId, contentId, courseId) => {
  const existing = await prisma.contentProgress.findUnique({ where: { userId_contentId: { userId, contentId } } });
  if (!existing?.isCompleted) {
    await prisma.contentProgress.upsert({
      where: { userId_contentId: { userId, contentId } },
      update: { isCompleted: true, completedAt: new Date() },
      create: { userId, contentId, isCompleted: true, completedAt: new Date() },
    });
  }
  return recomputeCourseProgress(userId, courseId);
};

module.exports = { ACCESS_STATUSES, getActiveEnrollment, recomputeCourseProgress, markLessonComplete, issueCertificate };
