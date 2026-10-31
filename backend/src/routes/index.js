const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getUsers, getUserById, createUser, updateUser, deleteUser,
  enrollUser, getDashboardStats, getStudentDashboard,
} = require('../controllers/userController');
const {
  getDashboard: teacherDashboard,
  listStudents, createStudent, updateStudent, deleteStudent, enrollStudent, listCourses: teacherCourses,
  resetStudentPassword, getMyCourses: teacherMyCourses, getStudent: teacherGetStudent,
} = require('../controllers/teacherController');
const {
  searchUsers,
  getConversations,
  startConversation,
  getConversationMessages,
  sendConversationMessage,
  getMyThread,
  sendMyMessage,
  adminListThreads,
  adminGetThread,
  adminReply,
  adminCloseThread,
  adminResetStudentPassword,
} = require('../controllers/chatController');
const { createOrder, verifyPayment, webhook, getPaymentHistory, adminGetPayments, adminRefundPayment } = require('../controllers/paymentController');
const { getSettings, updateSettings, getPublicSettings } = require('../services/settings');
const { ACCESS_STATUSES } = require('../services/progress');
const cache = require('../config/cache');
const { listEmails, retryEmail, listOutbox, retryOutbox } = require('../controllers/emailAdminController');
const integration = require('../controllers/integrationController');
const { downloadInvoice } = require('../controllers/invoiceController');
const { cacheResponse } = require('../middleware/cacheResponse');
const {
  listSchools, getSchool, createSchool, updateSchool, deleteSchool,
  listAcademicYears, createAcademicYear,
  listClasses, createClass, updateClass,
  assignTeacherToClass, removeTeacherFromClass,
  assignCourseToSchool, assignCourseToClass,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  getSchoolAnalytics, getSchoolOverview, exportSchoolStudents, exportSchools,
  listSchoolMembers, addSchoolMember, removeSchoolMember,
} = require('../controllers/schoolController');
const {
  getImportTemplate, validateImport, importStudents, listImportJobs, getImportJob,
} = require('../controllers/bulkImportController');
const {
  getOverview, getCourseAnalytics, getAtRiskStudents, getClassReport, exportStudentsCSV,
} = require('../controllers/analyticsController');
const { listAuditLogs, exportAuditLogs, recordClientActivity, logActivity } = require('../controllers/auditController');
const { getNavIndicators, markReadByLink } = require('../controllers/navController');
const { learnerEditBlocked } = require('../controllers/authController');
const { notifyUsers, notifyUser } = require('../services/notify');
const { listSessions, createSession, updateSession, deleteSession } = require('../controllers/mentorController');
const prisma = require('../config/database');
const { uploadToS3, generateS3Key } = require('../config/aws');
const { imageUpload } = require('../middleware/upload');

const adminAuth = [authenticate, authorize('ADMIN')];
const teacherAuth = [authenticate, authorize('TEACHER')];
const staffAuth = [authenticate, authorize('ADMIN', 'TEACHER')];
const studentAuth = [authenticate];

// ==================== ADMIN ====================
router.get('/admin/dashboard', ...adminAuth, cacheResponse(() => 'admin:dashboard', 30), getDashboardStats);
router.get('/admin/users', ...adminAuth, getUsers);
router.get('/admin/users/:id', ...adminAuth, getUserById);
router.post('/admin/users', ...adminAuth, createUser);
router.put('/admin/users/:id', ...adminAuth, updateUser);
router.delete('/admin/users/:id', ...adminAuth, deleteUser);
router.post('/admin/users/:id/enroll', ...adminAuth, enrollUser);
router.get('/admin/payments', ...adminAuth, adminGetPayments);
router.post('/admin/payments/:id/refund', ...adminAuth, adminRefundPayment);

// Platform settings
router.get('/admin/settings', ...adminAuth, async (req, res) => {
  try {
    res.json({ success: true, data: await getSettings() });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
});
router.put('/admin/settings', ...adminAuth, async (req, res) => {
  try {
    const data = await updateSettings(req.body || {});
    res.json({ success: true, message: 'Settings saved.', data });
  } catch (err) {
    console.error('updateSettings error:', err);
    res.status(500).json({ success: false, message: 'Failed to save settings.' });
  }
});
router.get('/settings/public', async (req, res) => {
  try {
    res.json({ success: true, data: await getPublicSettings() });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
});

// School management
router.get('/admin/schools', ...adminAuth, listSchools);
router.post('/admin/schools', ...adminAuth, createSchool);
router.get('/admin/schools/export', ...adminAuth, exportSchools);
router.get('/admin/schools/:id', ...adminAuth, getSchool);
router.get('/admin/schools/:id/overview', ...adminAuth, getSchoolOverview);
router.get('/admin/schools/:id/export', ...adminAuth, exportSchoolStudents);
router.put('/admin/schools/:id', ...adminAuth, updateSchool);
router.delete('/admin/schools/:id', ...adminAuth, deleteSchool);
router.get('/admin/schools/:id/members', ...adminAuth, listSchoolMembers);
router.post('/admin/schools/:id/members', ...adminAuth, addSchoolMember);
router.delete('/admin/schools/:id/members/:userId', ...adminAuth, removeSchoolMember);
router.get('/admin/schools/:id/analytics', ...adminAuth, getSchoolAnalytics);
router.get('/admin/schools/:id/academic-years', ...adminAuth, listAcademicYears);
router.post('/admin/schools/:id/academic-years', ...adminAuth, createAcademicYear);
router.get('/admin/schools/:id/classes', ...adminAuth, listClasses);
router.post('/admin/schools/:id/classes', ...adminAuth, createClass);
router.put('/admin/classes/:id', ...adminAuth, updateClass);
router.post('/admin/classes/:id/teachers', ...adminAuth, assignTeacherToClass);
router.delete('/admin/classes/:classId/teachers/:teacherId', ...adminAuth, removeTeacherFromClass);
router.get('/admin/classes/:id/students', ...adminAuth, listClassStudents);
router.post('/admin/classes/:id/students', ...adminAuth, addStudentToClass);
router.delete('/admin/classes/:classId/students/:studentId', ...adminAuth, removeStudentFromClass);
router.post('/admin/schools/:id/courses', ...adminAuth, assignCourseToSchool);
router.post('/admin/classes/:id/courses', ...adminAuth, assignCourseToClass);

// Analytics
router.get('/admin/analytics/overview', ...adminAuth, cacheResponse((req) => `admin:analytics:${JSON.stringify(req.query)}`, 60), getOverview);
router.get('/admin/analytics/courses', ...adminAuth, getCourseAnalytics);
router.get('/admin/analytics/at-risk', ...adminAuth, getAtRiskStudents);
router.get('/admin/analytics/class-report/:classId', ...adminAuth, getClassReport);
router.get('/admin/analytics/export/students', ...adminAuth, exportStudentsCSV);

// Audit logs
router.get('/admin/audit-logs', ...adminAuth, listAuditLogs);
router.get('/admin/audit-logs/export', ...adminAuth, exportAuditLogs);

// Activity reported by the app (page visits, downloads) and the sidebar "new" dots
router.post('/activity', authenticate, recordClientActivity);
router.get('/nav/indicators', authenticate, getNavIndicators);

router.get('/admin/support', ...adminAuth, adminListThreads);
router.get('/admin/support/:id', ...adminAuth, adminGetThread);
router.post('/admin/support/:id/reply', ...adminAuth, adminReply);
router.patch('/admin/support/:id', ...adminAuth, adminCloseThread);
router.post('/admin/support/:id/reset-password', ...adminAuth, adminResetStudentPassword);

// Teacher portal
router.get('/teacher/dashboard', ...teacherAuth, teacherDashboard);
router.get('/teacher/students', ...teacherAuth, listStudents);
router.post('/teacher/students', ...teacherAuth, createStudent);
router.put('/teacher/students/:id', ...teacherAuth, updateStudent);
router.delete('/teacher/students/:id', ...teacherAuth, deleteStudent);
router.post('/teacher/students/:id/enroll', ...teacherAuth, enrollStudent);
router.post('/teacher/students/:id/reset-password', ...teacherAuth, resetStudentPassword);
router.get('/teacher/courses', ...teacherAuth, teacherCourses);
router.get('/teacher/my-courses', ...teacherAuth, teacherMyCourses);

// Bulk import
router.get('/teacher/students/import/template', ...staffAuth, getImportTemplate);
router.post('/teacher/students/import/validate', ...staffAuth, validateImport);
router.post('/teacher/students/import', ...staffAuth, importStudents);
router.get('/teacher/students/import/jobs', ...staffAuth, listImportJobs);
router.get('/teacher/students/import/jobs/:id', ...staffAuth, getImportJob);
router.get('/teacher/students/:id', ...teacherAuth, teacherGetStudent);
// Admin can also use bulk import
router.get('/admin/students/import/template', ...adminAuth, getImportTemplate);
router.post('/admin/students/import/validate', ...adminAuth, validateImport);
router.post('/admin/students/import', ...adminAuth, importStudents);
router.get('/admin/students/import/jobs', ...adminAuth, listImportJobs);

// Chat & Messaging (Student / Teacher / Admin)
router.get('/chat/users/search', authenticate, searchUsers);
router.get('/chat/conversations', authenticate, getConversations);
router.post('/chat/conversations', authenticate, startConversation);
router.get('/chat/conversations/:id/messages', authenticate, getConversationMessages);
router.post('/chat/conversations/:id/messages', authenticate, sendConversationMessage);

// Legacy support endpoints
router.get('/support/thread', authenticate, getMyThread);
router.post('/support/thread', authenticate, sendMyMessage);

// Notifications (Admin & Teacher: Bulk or Individual dispatch)
const sendNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'INFO',
      link = '/dashboard',
      mode = 'BULK', // 'BULK' or 'INDIVIDUAL'
      target = 'ALL', // admin: 'ALL' | 'STUDENTS' | 'TEACHERS'; teachers always reach their own students
      recipientId,
      userIds,
      sendEmail: alsoEmail = true, // mirror the notification by email (learners' guardians included)
    } = req.body;

    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    const isTeacher = req.user.role === 'TEACHER';
    // Teachers can only reach the students they manage
    const audience = isTeacher ? { role: 'STUDENT', createdById: req.user.id } : {};
    const individual = mode === 'INDIVIDUAL' || recipientId || (Array.isArray(userIds) && userIds.length > 0);

    let where;
    if (individual) {
      const targetIds = Array.isArray(userIds) && userIds.length > 0 ? userIds : (recipientId ? [recipientId] : []);
      if (!targetIds.length) {
        return res.status(400).json({ success: false, message: 'Please select at least one recipient.' });
      }
      where = { id: { in: targetIds.map(String) }, isActive: true, ...audience };
    } else if (isTeacher) {
      where = { isActive: true, ...audience };
    } else {
      where = {
        isActive: true,
        ...(target === 'STUDENTS' && { role: 'STUDENT' }),
        ...(target === 'TEACHERS' && { role: 'TEACHER' }),
        ...(target === 'ALL' && { id: { not: req.user.id } }),
      };
    }

    const recipients = await prisma.user.findMany({ where, select: { id: true, firstName: true, lastName: true } });
    if (!recipients.length) {
      return individual
        ? res.status(404).json({ success: false, message: isTeacher ? 'Select students from your own student list.' : 'No valid active recipients found.' })
        : res.json({ success: true, message: 'No recipients found matching target criteria.', count: 0 });
    }

    const { emailed } = await notifyUsers(
      recipients.map((u) => u.id),
      { title: title.trim(), message: message.trim(), type: type || 'INFO', link: link || '/dashboard' },
      { email: alsoEmail !== false }
    );

    const who = recipients.length === 1
      ? `${recipients[0].firstName} ${recipients[0].lastName}`
      : `${recipients.length} ${isTeacher || target === 'STUDENTS' ? 'students' : target === 'TEACHERS' ? 'teachers' : individual ? 'recipients' : 'users'}`;

    return res.json({
      success: true,
      message: `Notification sent to ${who}${emailed ? ` and emailed to ${emailed} address${emailed === 1 ? '' : 'es'}` : ''}! 🔔`,
      count: recipients.length,
      emailed,
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to send notification.' });
  }
};

router.post('/notifications/send', ...staffAuth, sendNotification);
router.post('/admin/notifications/broadcast', ...staffAuth, sendNotification);
router.post('/teacher/notifications/send', ...staffAuth, sendNotification);

// Notification sent history (Admin & Teacher)
router.get('/notifications/history', ...staffAuth, async (req, res) => {
  try {
    const isTeacher = req.user.role === 'TEACHER';
    const where = isTeacher
      ? { user: { role: 'STUDENT', createdById: req.user.id } }
      : {};

    const recent = await prisma.notification.findMany({
      where,
      take: 60,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            username: true,
            role: true,
            avatar: true,
          },
        },
      },
    });
    res.json({ success: true, data: recent });
  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

// Delete single notification
router.delete('/notifications/:id', ...studentAuth, async (req, res) => {
  try {
    const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.status(404).json({ success: false, message: 'Not found' });
    if (notif.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
});

// ==================== STUDENT ====================
router.get('/student/dashboard', ...studentAuth, getStudentDashboard);
router.get('/student/enrollments', ...studentAuth, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id },
      include: {
        course: {
          include: {
            category: { select: { name: true } },
            sections: {
              where: { isPublished: true },
              include: { contents: { where: { isPublished: true } } },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    res.json({ success: true, data: enrollments });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch enrollments.' });
  }
});

// Get course progress for student
router.get('/student/courses/:courseId/progress', ...studentAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId } },
    });
    if (!enrollment) return res.status(403).json({ success: false, message: 'Not enrolled.' });

    const progress = await prisma.contentProgress.findMany({
      where: {
        userId: req.user.id,
        content: { section: { courseId } },
      },
    });

    res.json({ success: true, data: { enrollment, progress } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch progress.' });
  }
});

// Notifications
router.get('/notifications', ...studentAuth, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: notifications });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});
router.put('/notifications/read-by-link', ...studentAuth, markReadByLink);
router.put('/notifications/:id/read', ...studentAuth, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});
router.put('/notifications/read-all', ...studentAuth, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id }, data: { isRead: true } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// Avatar upload
router.post('/profile/avatar', ...studentAuth, imageUpload.single('avatar'), async (req, res) => {
  try {
    if (await learnerEditBlocked(req, res)) return;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const key = generateS3Key(`avatars`, req.file.originalname);
    const { cloudFrontUrl } = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatar: cloudFrontUrl } });
    res.json({ success: true, data: { avatar: cloudFrontUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload avatar.' });
  }
});

// Forum — only staff and learners enrolled in the course can read or post
const canUseCourseForum = async (user, courseId) => {
  if (user.role === 'ADMIN' || user.role === 'TEACHER') return true;
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, courseId, status: { in: ACCESS_STATUSES } },
    select: { id: true },
  });
  return Boolean(enrollment);
};
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

router.get('/courses/:courseId/forum', ...studentAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!(await canUseCourseForum(req.user, courseId))) {
      return res.status(403).json({ success: false, message: 'Enroll in this course to view its forum.' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where: { courseId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { firstName: true, lastName: true, avatar: true } },
          _count: { select: { replies: true } },
        },
      }),
      prisma.forumPost.count({ where: { courseId } }),
    ]);

    res.json({ success: true, data: { posts, pagination: { total, page } } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch forum.' });
  }
});

router.post('/courses/:courseId/forum', ...studentAuth, async (req, res) => {
  try {
    const title = cleanText(req.body.title, 200);
    const content = cleanText(req.body.content, 10000);
    if (!title || !content) return res.status(400).json({ success: false, message: 'Title and content are required.' });
    if (!(await canUseCourseForum(req.user, req.params.courseId))) {
      return res.status(403).json({ success: false, message: 'Enroll in this course to post in its forum.' });
    }
    const post = await prisma.forumPost.create({
      data: { title, content, userId: req.user.id, courseId: req.params.courseId },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
    });
    logActivity(req, 'FORUM_POST', { targetId: post.id, targetType: 'forum_post', title, courseId: req.params.courseId });
    res.status(201).json({ success: true, data: post });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create post.' });
  }
});

router.get('/forum/posts/:postId', ...studentAuth, async (req, res) => {
  try {
    const post = await prisma.forumPost.findUnique({
      where: { id: req.params.postId },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true, role: true } },
        course: { select: { id: true, title: true, slug: true } },
        replies: {
          include: { user: { select: { firstName: true, lastName: true, avatar: true, role: true } } },
          orderBy: [{ isAnswer: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!post || !(await canUseCourseForum(req.user, post.courseId))) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    await prisma.forumPost.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    res.json({ success: true, data: post });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch post.' });
  }
});

router.post('/forum/posts/:postId/reply', ...studentAuth, async (req, res) => {
  try {
    const content = cleanText(req.body.content, 10000);
    if (!content) return res.status(400).json({ success: false, message: 'Reply cannot be empty.' });
    const post = await prisma.forumPost.findUnique({ where: { id: req.params.postId }, select: { id: true, courseId: true, isLocked: true } });
    if (!post || !(await canUseCourseForum(req.user, post.courseId))) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    if (post.isLocked && req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'This discussion is locked.' });
    }
    const reply = await prisma.forumReply.create({
      data: { content, userId: req.user.id, postId: post.id },
      include: { user: { select: { firstName: true, lastName: true, avatar: true, role: true } } },
    });
    logActivity(req, 'FORUM_REPLY', { targetId: post.id, targetType: 'forum_post' });
    res.status(201).json({ success: true, data: reply });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to add reply.' });
  }
});

// ==================== BOOKMARKS ====================
router.get('/student/bookmarks', ...studentAuth, async (req, res) => {
  try {
    const bookmarks = await prisma.courseBookmark.findMany({
      where: { userId: req.user.id, course: { status: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      include: {
        course: {
          select: {
            id: true, title: true, slug: true, thumbnail: true, shortDesc: true, price: true, discountPrice: true,
            isFree: true, level: true, totalLessons: true, totalDuration: true, totalStudents: true,
            category: { select: { name: true } },
          },
        },
      },
    });
    res.json({ success: true, data: bookmarks });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load bookmarks.' });
  }
});

// Toggle: bookmarks the course if it is not saved, removes it if it is
router.post('/student/bookmarks/:courseId', ...studentAuth, async (req, res) => {
  try {
    const where = { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } };
    const existing = await prisma.courseBookmark.findUnique({ where });
    if (existing) {
      await prisma.courseBookmark.delete({ where });
      return res.json({ success: true, data: { bookmarked: false } });
    }
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { status: true } });
    if (!course || course.status !== 'PUBLISHED') return res.status(404).json({ success: false, message: 'Course not found.' });
    await prisma.courseBookmark.create({ data: { userId: req.user.id, courseId: req.params.courseId } });
    res.json({ success: true, data: { bookmarked: true } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update bookmark.' });
  }
});

// ==================== LESSON NOTES ====================
router.get('/student/courses/:courseId/notes', ...studentAuth, async (req, res) => {
  try {
    const notes = await prisma.lessonNote.findMany({
      where: { userId: req.user.id, content: { section: { courseId: req.params.courseId } } },
      orderBy: { createdAt: 'desc' },
      include: { content: { select: { id: true, title: true } } },
    });
    res.json({ success: true, data: notes });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load notes.' });
  }
});

router.post('/student/notes', ...studentAuth, async (req, res) => {
  try {
    const text = cleanText(req.body.text, 5000);
    const contentId = String(req.body.contentId || '');
    if (!text || !contentId) return res.status(400).json({ success: false, message: 'Note text and lesson are required.' });
    const content = await prisma.content.findUnique({ where: { id: contentId }, select: { section: { select: { courseId: true } } } });
    if (!content) return res.status(404).json({ success: false, message: 'Lesson not found.' });
    const enrolled = req.user.role === 'ADMIN' || await prisma.enrollment.findFirst({
      where: { userId: req.user.id, courseId: content.section.courseId, status: { in: ACCESS_STATUSES } },
      select: { id: true },
    });
    if (!enrolled) return res.status(403).json({ success: false, message: 'Enroll in this course to take notes.' });
    const note = await prisma.lessonNote.create({
      data: { userId: req.user.id, contentId, text, timestamp: Math.max(0, parseInt(req.body.timestamp, 10) || 0) },
      include: { content: { select: { id: true, title: true } } },
    });
    res.status(201).json({ success: true, data: note });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to save note.' });
  }
});

router.delete('/student/notes/:id', ...studentAuth, async (req, res) => {
  try {
    const { count } = await prisma.lessonNote.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!count) return res.status(404).json({ success: false, message: 'Note not found.' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete note.' });
  }
});

// Certificates
router.get('/certificates', ...studentAuth, async (req, res) => {
  try {
    const certs = await prisma.certificate.findMany({
      where: { userId: req.user.id },
      include: { course: { select: { title: true, thumbnail: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    res.json({ success: true, data: certs });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch certificates.' });
  }
});

// Mentor sessions (everyone can view; admin manages)
router.get('/mentor-sessions', ...studentAuth, listSessions);
router.post('/admin/mentor-sessions', ...adminAuth, createSession);
router.put('/admin/mentor-sessions/:id', ...adminAuth, updateSession);
router.delete('/admin/mentor-sessions/:id', ...adminAuth, deleteSession);

// Email delivery log and Operations sync events (admin)
router.get('/admin/emails', ...adminAuth, listEmails);
router.post('/admin/emails/:id/retry', ...adminAuth, retryEmail);
router.get('/admin/outbox', ...adminAuth, listOutbox);
router.post('/admin/outbox/:id/retry', ...adminAuth, retryOutbox);

// Service-to-service events from Operations (HMAC-signed, not user-authenticated)
router.post('/integrations/operations/events', integration.authenticate, integration.receiveEvent);
router.get('/integrations/operations/ping', integration.authenticate, integration.ping);
router.post('/integrations/operations/emails/:id/retry', integration.authenticate, integration.retryEmail);

// Payment routes
router.post('/payments/create-order', ...studentAuth, createOrder);
router.post('/payments/verify', ...studentAuth, verifyPayment);
router.post('/payments/webhook', webhook); // No auth - Razorpay webhook
router.get('/payments/history', ...studentAuth, getPaymentHistory);
router.get('/payments/:id/invoice', ...studentAuth, downloadInvoice);

module.exports = router;
