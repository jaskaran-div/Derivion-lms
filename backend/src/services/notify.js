/**
 * Notifications: the in-app bell entry, optionally mirrored by email.
 *
 * Who gets the email:
 *  - the user's own address, unless it is the internal placeholder given to teacher-created learners
 *  - for learners, also their guardian's email (so school learners without an inbox are still reached)
 * Emails go out in the background; the request never waits for (or fails because of) the mail server.
 */
const prisma = require('../config/database');
const { sendEmail, emailTemplates, emailConfigured } = require('../config/email');
const { isPlaceholderEmail } = require('../utils/credentials');
const { isEnabled: integrationEnabled } = require('../config/integration');

const EMAIL_CONCURRENCY = 3;

const recipientsFor = (user) => {
  const out = [];
  if (user.email && !isPlaceholderEmail(user.email)) out.push({ to: user.email, forGuardian: false });
  if (user.role === 'STUDENT' && user.guardianEmail && user.guardianEmail.toLowerCase() !== user.email?.toLowerCase()) {
    out.push({ to: user.guardianEmail, forGuardian: true });
  }
  return out;
};

// Sends a batch of emails a few at a time, in the background
const deliver = (jobs) => {
  if (!jobs.length) return;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await sendEmail(job).catch(() => {});
    }
  };
  Promise.all(Array.from({ length: Math.min(EMAIL_CONCURRENCY, jobs.length) }, worker))
    .catch((err) => console.error('[notify] email batch failed:', err.message));
};

/**
 * Notify users in the app and (when email is true) by email.
 * @param {string[]} userIds
 * @param {{ title: string, message: string, type?: string, link?: string }} notification
 * @returns {Promise<{ notified: number, emailed: number }>}
 */
const notifyUsers = async (userIds, { title, message, type = 'INFO', link = null }, { email = false } = {}) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return { notified: 0, emailed: 0 };

  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, title, message, type, link })),
  });

  if (!email || !emailConfigured()) return { notified: ids.length, emailed: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { firstName: true, lastName: true, email: true, role: true, guardianEmail: true },
  });
  const jobs = users.flatMap((u) =>
    recipientsFor(u).map(({ to, forGuardian }) => ({
      to,
      ...emailTemplates.notification({ name: `${u.firstName} ${u.lastName}`.trim(), title, message, link, forGuardian }),
    }))
  );
  deliver(jobs);
  return { notified: ids.length, emailed: jobs.length };
};

const notifyUser = (userId, notification, options) => notifyUsers([userId], notification, options);

// A teacher or admin enrolled a learner in a course: tell the learner (and guardian) by email too
const notifyEnrollment = async (userId, courseId) => {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, slug: true } });
  if (!course) return;
  // Learners who are synchronized with Operations receive the onboarding email instead of this generic one
  const learner = integrationEnabled() ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const replacedByOnboardingEmail = Boolean(learner) && require('./lifecycle').eligible(learner);
  await notifyUser(userId, {
    title: 'You have a new course',
    message: `You have been enrolled in "${course.title}". Open it from My Courses to start learning.`,
    type: 'SUCCESS',
    link: `/courses/${course.slug}`,
  }, { email: !replacedByOnboardingEmail });
};

module.exports = { notifyUsers, notifyUser, notifyEnrollment, recipientsFor };
