/**
 * Sidebar "something new" dots. For each menu path the client gets
 *   count    — things still waiting for the user (unread chats, unread notifications pointing there…)
 *   latestAt — when something last changed there; the client compares it with when the user last opened that page
 */
const prisma = require('../config/database');

const latest = async (query) => {
  const row = await query;
  if (!row) return null;
  return Object.values(row).find((v) => v instanceof Date) || null;
};

// Unread chat messages for this user across direct conversations and (for admins) support threads
const unreadChats = async (user) => {
  const isAdmin = user.role === 'ADMIN';
  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [
        { user1Id: user.id },
        { user2Id: user.id },
        isAdmin ? { userId: { not: null } } : { userId: user.id },
      ],
    },
    select: { user1Id: true, user2Id: true, userId: true, unreadUser1: true, unreadUser2: true, unreadAdmin: true, unreadUser: true },
  });
  return threads.reduce((sum, t) => {
    if (t.user1Id === user.id) return sum + t.unreadUser1;
    if (t.user2Id === user.id) return sum + t.unreadUser2;
    if (t.userId === user.id) return sum + t.unreadUser;
    return sum + (isAdmin ? t.unreadAdmin : 0);
  }, 0);
};

const learnerIndicators = async (user) => {
  const enrolled = await prisma.enrollment.findMany({ where: { userId: user.id, status: { not: 'REFUNDED' } }, select: { courseId: true } });
  const courseIds = enrolled.map((e) => e.courseId);
  const [chats, myCourses, catalog, mentors, certificates, forumPost, forumReply, payments] = await Promise.all([
    unreadChats(user),
    latest(prisma.enrollment.findFirst({ where: { userId: user.id }, orderBy: { enrolledAt: 'desc' }, select: { enrolledAt: true } })),
    latest(prisma.course.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.mentorSession.findFirst({ where: { courseId: { in: courseIds } }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })),
    latest(prisma.certificate.findFirst({ where: { userId: user.id }, orderBy: { issuedAt: 'desc' }, select: { issuedAt: true } })),
    latest(prisma.forumPost.findFirst({ where: { courseId: { in: courseIds }, userId: { not: user.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.forumReply.findFirst({ where: { post: { courseId: { in: courseIds } }, userId: { not: user.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.payment.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })),
  ]);
  const forum = [forumPost, forumReply].filter(Boolean).sort((a, b) => b - a)[0] || null;
  return {
    '/my-courses': { latestAt: myCourses },
    '/courses': { latestAt: catalog },
    '/mentors': { latestAt: mentors },
    '/certificates': { latestAt: certificates },
    '/forum': { latestAt: forum },
    '/support': { count: chats },
    '/payments': { latestAt: payments },
  };
};

const teacherIndicators = async (user) => {
  const mine = { user: { createdById: user.id, role: 'STUDENT' } };
  const [chats, enrollment, certificate, mentors, courses, imports] = await Promise.all([
    unreadChats(user),
    latest(prisma.enrollment.findFirst({ where: { ...mine, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } })),
    latest(prisma.certificate.findFirst({ where: mine, orderBy: { issuedAt: 'desc' }, select: { issuedAt: true } })),
    latest(prisma.mentorSession.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })),
    latest(prisma.course.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.studentImportJob.findFirst({ where: { createdById: user.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } })),
  ]);
  return {
    '/teacher/students': { latestAt: [enrollment, certificate].filter(Boolean).sort((a, b) => b - a)[0] || null },
    '/teacher/courses': { latestAt: courses },
    '/teacher/mentors': { latestAt: mentors },
    '/teacher/import': { latestAt: imports },
    '/teacher/support': { count: chats },
  };
};

const adminIndicators = async (user) => {
  // The audit-log retention warning arrives as a notification linked to /admin/audit-logs (see jobs/cleanup)
  const [chats, users, schools, payments, imports, attempts] = await Promise.all([
    unreadChats(user),
    latest(prisma.user.findFirst({ where: { id: { not: user.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.school.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })),
    latest(prisma.payment.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })),
    latest(prisma.studentImportJob.findFirst({ where: { completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } })),
    latest(prisma.assessmentAttempt.findFirst({ where: { status: 'SUBMITTED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } })),
  ]);
  return {
    '/admin/support': { count: chats },
    '/admin/users': { latestAt: users },
    '/admin/schools': { latestAt: schools },
    '/admin/import': { latestAt: imports },
    '/admin/payments': { latestAt: payments },
    '/admin/quizzes': { latestAt: attempts },
  };
};

// GET /api/nav/indicators
const getNavIndicators = async (req, res) => {
  try {
    const user = req.user;
    const [base, unread] = await Promise.all([
      user.role === 'ADMIN' ? adminIndicators(user) : user.role === 'TEACHER' ? teacherIndicators(user) : learnerIndicators(user),
      prisma.notification.groupBy({ by: ['link'], where: { userId: user.id, isRead: false, link: { not: null } }, _count: { _all: true } }),
    ]);
    res.json({
      success: true,
      data: {
        items: base,
        // Unread notifications by the page they point to; the client adds them to the matching menu item
        unreadByLink: Object.fromEntries(unread.map((u) => [u.link, u._count._all])),
      },
    });
  } catch (error) {
    console.error('Nav indicators error:', error);
    res.status(500).json({ success: false, message: 'Failed to load updates.' });
  }
};

// PUT /api/notifications/read-by-link { path } — opening a page clears the notifications that point to it
const markReadByLink = async (req, res) => {
  try {
    const path = typeof req.body?.path === 'string' ? req.body.path.split('?')[0] : '';
    if (!path.startsWith('/')) return res.status(400).json({ success: false, message: 'A page path is required.' });
    const { count } = await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false,
        OR: [{ link: path }, { link: { startsWith: `${path}?` } }, ...(path === '/' ? [] : [{ link: { startsWith: `${path}/` } }])],
      },
      data: { isRead: true },
    });
    res.json({ success: true, data: { count } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
};

module.exports = { getNavIndicators, markReadByLink };
