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
const { createOrder, verifyPayment, webhook, getPaymentHistory, adminGetPayments } = require('../controllers/paymentController');
const {
  listSchools, getSchool, createSchool, updateSchool, deleteSchool,
  listAcademicYears, createAcademicYear,
  listClasses, createClass, updateClass,
  assignTeacherToClass, removeTeacherFromClass,
  assignCourseToSchool, assignCourseToClass,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  getSchoolAnalytics,
  listSchoolMembers, addSchoolMember, removeSchoolMember,
} = require('../controllers/schoolController');
const {
  getImportTemplate, validateImport, importStudents, listImportJobs, getImportJob,
} = require('../controllers/bulkImportController');
const {
  getOverview, getCourseAnalytics, getAtRiskStudents, getClassReport, exportStudentsCSV,
} = require('../controllers/analyticsController');
const { listAuditLogs } = require('../controllers/auditController');
const prisma = require('../config/database');
const { uploadToS3, generateS3Key } = require('../config/aws');
const { imageUpload } = require('../middleware/upload');

const adminAuth = [authenticate, authorize('ADMIN')];
const teacherAuth = [authenticate, authorize('TEACHER')];
const staffAuth = [authenticate, authorize('ADMIN', 'TEACHER')];
const studentAuth = [authenticate];

// ==================== ADMIN ====================
router.get('/admin/dashboard', ...adminAuth, getDashboardStats);
router.get('/admin/users', ...adminAuth, getUsers);
router.get('/admin/users/:id', ...adminAuth, getUserById);
router.post('/admin/users', ...adminAuth, createUser);
router.put('/admin/users/:id', ...adminAuth, updateUser);
router.delete('/admin/users/:id', ...adminAuth, deleteUser);
router.post('/admin/users/:id/enroll', ...adminAuth, enrollUser);
router.get('/admin/payments', ...adminAuth, adminGetPayments);

// School management
router.get('/admin/schools', ...adminAuth, listSchools);
router.post('/admin/schools', ...adminAuth, createSchool);
router.get('/admin/schools/:id', ...adminAuth, getSchool);
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
router.get('/admin/analytics/overview', ...adminAuth, getOverview);
router.get('/admin/analytics/courses', ...adminAuth, getCourseAnalytics);
router.get('/admin/analytics/at-risk', ...adminAuth, getAtRiskStudents);
router.get('/admin/analytics/class-report/:classId', ...adminAuth, getClassReport);
router.get('/admin/analytics/export/students', ...adminAuth, exportStudentsCSV);

// Audit logs
router.get('/admin/audit-logs', ...adminAuth, listAuditLogs);

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
router.get('/teacher/courses', ...teacherAuth, teacherCourses);

// Bulk import
router.get('/teacher/students/import/template', ...staffAuth, getImportTemplate);
router.post('/teacher/students/import/validate', ...staffAuth, validateImport);
router.post('/teacher/students/import', ...staffAuth, importStudents);
router.get('/teacher/students/import/jobs', ...staffAuth, listImportJobs);
router.get('/teacher/students/import/jobs/:id', ...staffAuth, getImportJob);
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
      target = 'ALL', // 'ALL' | 'STUDENTS' | 'TEACHERS' | 'MY_STUDENTS'
      recipientId,
      userIds,
    } = req.body;

    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    const isTeacher = req.user.role === 'TEACHER';

    // 1. INDIVIDUAL MODE
    if (mode === 'INDIVIDUAL' || recipientId || (Array.isArray(userIds) && userIds.length > 0)) {
      const targetIds = Array.isArray(userIds) && userIds.length > 0
        ? userIds
        : (recipientId ? [recipientId] : []);

      if (!targetIds.length) {
        return res.status(400).json({ success: false, message: 'Please select at least one recipient.' });
      }

      // If teacher, they can notify students (or any active user)
      const validUsers = await prisma.user.findMany({
        where: {
          id: { in: targetIds },
          isActive: true,
          ...(isTeacher ? { role: 'STUDENT' } : {}),
        },
        select: { id: true, firstName: true, lastName: true },
      });

      if (!validUsers.length) {
        return res.status(404).json({ success: false, message: 'No valid active recipients found.' });
      }

      await prisma.notification.createMany({
        data: validUsers.map((u) => ({
          userId: u.id,
          title: title.trim(),
          message: message.trim(),
          type: type || 'INFO',
          link: link || '/dashboard',
        })),
      });

      const recipientText = validUsers.length === 1
        ? `${validUsers[0].firstName} ${validUsers[0].lastName}`
        : `${validUsers.length} selected recipients`;

      return res.json({
        success: true,
        message: `Notification sent to ${recipientText}! 🔔`,
        count: validUsers.length,
      });
    }

    // 2. BULK MODE
    let whereClause = { isActive: true };
    if (isTeacher) {
      if (target === 'MY_STUDENTS') {
        whereClause.createdById = req.user.id;
        whereClause.role = 'STUDENT';
      } else {
        whereClause.role = 'STUDENT';
      }
    } else {
      // Admin
      if (target === 'STUDENTS') whereClause.role = 'STUDENT';
      else if (target === 'TEACHERS') whereClause.role = 'TEACHER';
      else if (target === 'ALL') {
        whereClause.id = { not: req.user.id };
      }
    }

    const recipients = await prisma.user.findMany({
      where: whereClause,
      select: { id: true },
    });

    if (!recipients.length) {
      return res.json({ success: true, message: 'No recipients found matching target criteria.', count: 0 });
    }

    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        title: title.trim(),
        message: message.trim(),
        type: type || 'INFO',
        link: link || '/dashboard',
      })),
    });

    const targetLabel = isTeacher
      ? 'students'
      : (target === 'STUDENTS' ? 'students' : (target === 'TEACHERS' ? 'teachers' : 'all users'));

    return res.json({
      success: true,
      message: `Notification sent to ${recipients.length} ${targetLabel}! 🔔`,
      count: recipients.length,
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
      ? { user: { role: 'STUDENT' } }
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
    if (notif.userId !== req.user.id && req.user.role !== 'ADMIN' && req.user.role !== 'TEACHER') {
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
router.put('/notifications/:id/read', ...studentAuth, async (req, res) => {
  try {
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
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
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    const key = generateS3Key(`avatars`, req.file.originalname);
    const { cloudFrontUrl } = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatar: cloudFrontUrl } });
    res.json({ success: true, data: { avatar: cloudFrontUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload avatar.' });
  }
});

// Forum
router.get('/courses/:courseId/forum', ...studentAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where: { courseId },
        skip,
        take: parseInt(limit),
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { firstName: true, lastName: true, avatar: true } },
          _count: { select: { replies: true } },
        },
      }),
      prisma.forumPost.count({ where: { courseId } }),
    ]);

    res.json({ success: true, data: { posts, pagination: { total, page: parseInt(page) } } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch forum.' });
  }
});

router.post('/courses/:courseId/forum', ...studentAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = await prisma.forumPost.create({
      data: { title, content, userId: req.user.id, courseId: req.params.courseId },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
    });
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
        user: { select: { firstName: true, lastName: true, avatar: true } },
        replies: {
          include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
          orderBy: [{ isAnswer: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    await prisma.forumPost.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
    res.json({ success: true, data: post });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch post.' });
  }
});

router.post('/forum/posts/:postId/reply', ...studentAuth, async (req, res) => {
  try {
    const reply = await prisma.forumReply.create({
      data: { content: req.body.content, userId: req.user.id, postId: req.params.postId },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
    });
    res.status(201).json({ success: true, data: reply });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to add reply.' });
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

// Payment routes
router.post('/payments/create-order', ...studentAuth, createOrder);
router.post('/payments/verify', ...studentAuth, verifyPayment);
router.post('/payments/webhook', webhook); // No auth - Razorpay webhook
router.get('/payments/history', ...studentAuth, getPaymentHistory);

module.exports = router;
