const prisma = require('../config/database');
const lifecycle = require('../services/lifecycle');
const { logAudit } = require('./auditController');
const { notifyEnrollment } = require('../services/notify');

// GET /api/admin/users
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, firstName: true, lastName: true, phone: true,
          role: true, isActive: true, createdAt: true, lastLogin: true, avatar: true,
          guardianEmail: true, guardianPhone: true,
          _count: { select: { enrollments: true, certificates: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: { users, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
};

// GET /api/admin/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, username: true, firstName: true, lastName: true, phone: true,
        role: true, isActive: true, createdAt: true, lastLogin: true, avatar: true,
        guardianEmail: true, guardianPhone: true,
        enrollments: {
          include: {
            course: { select: { title: true, thumbnail: true, slug: true } },
          },
          orderBy: { enrolledAt: 'desc' },
        },
        payments: {
          include: { course: { select: { title: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        certificates: {
          include: { course: { select: { title: true } } },
          orderBy: { issuedAt: 'desc' },
        },
      },
    });

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
};

// POST /api/admin/users - Create user (admin can create students/admins)
const createUser = async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { email, password, firstName, lastName, phone, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, phone, role: role || 'STUDENT' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    res.status(201).json({ success: true, message: 'User created.', data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
};

// PUT /api/admin/users/:id
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, role, isActive } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) return res.status(404).json({ success: false, message: 'User not found.' });

    const user = await prisma.user.update({
      where: { id },
      data: { firstName, lastName, phone, role, isActive },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });

    if (role && role !== existingUser.role) {
      await logAudit({
        userId: req.user.id,
        action: 'ROLE_CHANGE',
        targetId: id,
        targetType: 'user',
        details: { oldRole: existingUser.role, newRole: role },
        req,
      });
    }

    if (isActive !== undefined && isActive !== existingUser.isActive) {
      await logAudit({
        userId: req.user.id,
        action: 'ADMIN_ACTION',
        targetId: id,
        targetType: 'user',
        details: { action: isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED' },
        req,
      });
    }

    // Identity details of a synchronized learner changed: tell Operations (no-op unless eligible and the integration is on)
    try {
      await lifecycle.onLearnerUpdated(prisma, await prisma.user.findUnique({ where: { id } }));
    } catch (e) {
      console.error('learner.updated not queued:', e.message);
    }

    res.json({ success: true, message: 'User updated.', data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { email: true, role: true } });
    await prisma.user.delete({ where: { id } });

    await logAudit({
      userId: req.user.id,
      action: 'USER_DELETED',
      targetId: id,
      targetType: 'user',
      details: { email: target?.email, role: target?.role },
      req,
    });

    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
};

// POST /api/admin/users/:id/enroll - Manually enroll user
const enrollUser = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { courseId } = req.body;

    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) return res.status(409).json({ success: false, message: 'User already enrolled.' });

    const enrollment = await prisma.enrollment.create({ data: { userId, courseId } });
    await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
    await lifecycle.afterEnrollmentCreated({ userId, courseId, source: 'admin' });
    notifyEnrollment(userId, courseId).catch(() => {});

    res.status(201).json({ success: true, message: 'User enrolled.', data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to enroll user.' });
  }
};

// GET /api/admin/dashboard - Stats
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, totalCourses, totalEnrollments, totalRevenue,
      recentUsers, recentEnrollments, revenueByMonth, popularCourses,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.course.count({ where: { status: 'PUBLISHED' } }),
      prisma.enrollment.count(),
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),

      // Recent users
      prisma.user.findMany({
        where: { role: 'STUDENT' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true, username: true, createdAt: true, avatar: true },
      }),

      // Recent enrollments
      prisma.enrollment.findMany({
        orderBy: { enrolledAt: 'desc' },
        take: 5,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, username: true } },
          course: { select: { title: true, thumbnail: true } },
        },
      }),

      // Revenue by month (last 6 months)
      prisma.$queryRaw`
  SELECT 
    TO_CHAR("createdAt", 'Mon YYYY') as month,
    SUM(amount)::float as revenue,
    COUNT(*)::int as count
  FROM payments
  WHERE status = 'SUCCESS' 
    AND "createdAt" >= NOW() - INTERVAL '6 months'
  GROUP BY 
    TO_CHAR("createdAt", 'Mon YYYY'),
    DATE_TRUNC('month', "createdAt")
  ORDER BY DATE_TRUNC('month', "createdAt")
`,

      // Popular courses
      prisma.course.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { totalStudents: 'desc' },
        take: 5,
        select: { id: true, title: true, thumbnail: true, totalStudents: true, price: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalCourses,
          totalEnrollments,
          totalRevenue: parseFloat(totalRevenue._sum.amount || 0),
        },
        recentUsers,
        recentEnrollments,
        revenueByMonth,
        popularCourses,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats.' });
  }
};

// GET /api/student/dashboard
const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const [enrollments, certificates, notifications, recentProgress] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        include: {
          course: {
            include: {
              category: { select: { name: true } },
              _count: { select: { sections: true } },
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      }),

      prisma.certificate.count({ where: { userId } }),

      prisma.notification.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      prisma.contentProgress.findMany({
        where: { userId, isCompleted: false },
        include: {
          content: {
            select: {
              title: true,
              type: true,
              section: { select: { title: true, course: { select: { title: true, slug: true } } } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          enrolledCourses: enrollments.length,
          completedCourses: enrollments.filter((e) => e.status === 'COMPLETED').length,
          certificates,
          inProgressCourses: enrollments.filter((e) => e.status === 'ACTIVE' && parseFloat(e.progressPercent) > 0).length,
        },
        enrollments,
        notifications,
        recentProgress,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard.' });
  }
};

module.exports = {
  getUsers, getUserById, createUser, updateUser, deleteUser, enrollUser,
  getDashboardStats, getStudentDashboard,
};
