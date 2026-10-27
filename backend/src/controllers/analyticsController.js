const prisma = require('../config/database');
const { schoolStudentWhere } = require('../services/learners');

// GET /api/admin/analytics/overview
const getOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = startDate && endDate
      ? { gte: new Date(startDate), lte: new Date(endDate) }
      : undefined;

    const [
      totalStudents, totalTeachers, totalSchools,
      totalEnrollments, completedEnrollments,
      totalRevenue, totalCourses,
      enrollmentsByMonth, revenueByMonth,
      popularCourses, assessmentStats,
      notStartedCount,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.school.count({ where: { isActive: true } }),
      prisma.enrollment.count({
        where: dateFilter ? { enrolledAt: dateFilter } : {},
      }),
      prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
      prisma.payment.aggregate({
        where: {
          status: 'SUCCESS',
          ...(dateFilter && { createdAt: dateFilter }),
        },
        _sum: { amount: true },
      }),
      prisma.course.count({ where: { status: 'PUBLISHED' } }),

      // Enrollments by month (last 6)
      prisma.$queryRaw`
        SELECT
          TO_CHAR("enrolledAt", 'Mon YYYY') as month,
          COUNT(*)::int as count
        FROM enrollments
        WHERE "enrolledAt" >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR("enrolledAt", 'Mon YYYY'), DATE_TRUNC('month', "enrolledAt")
        ORDER BY DATE_TRUNC('month', "enrolledAt")
      `,

      // Revenue by month (last 6)
      prisma.$queryRaw`
        SELECT
          TO_CHAR("createdAt", 'Mon YYYY') as month,
          SUM(amount)::float as revenue,
          COUNT(*)::int as count
        FROM payments
        WHERE status = 'SUCCESS'
          AND "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR("createdAt", 'Mon YYYY'), DATE_TRUNC('month', "createdAt")
        ORDER BY DATE_TRUNC('month', "createdAt")
      `,

      // Popular courses by enrollment
      prisma.course.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { totalStudents: 'desc' },
        take: 10,
        select: {
          id: true, title: true, thumbnail: true,
          totalStudents: true, price: true, level: true,
          _count: { select: { assessments: true } },
        },
      }),

      // Assessment pass rates
      prisma.assessmentAttempt.aggregate({
        _avg: { score: true },
        _count: { id: true },
      }),

      // Students who haven't started anything
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM users u
        WHERE u.role = 'STUDENT'
          AND NOT EXISTS (
            SELECT 1 FROM enrollments e WHERE e."userId" = u.id
          )
      `,
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalStudents,
          totalTeachers,
          totalSchools,
          totalCourses,
          totalEnrollments,
          completedEnrollments,
          completionRate: totalEnrollments > 0
            ? ((completedEnrollments / totalEnrollments) * 100).toFixed(1)
            : 0,
          totalRevenue: parseFloat(totalRevenue._sum.amount || 0),
          avgAssessmentScore: assessmentStats._avg.score
            ? parseFloat(assessmentStats._avg.score).toFixed(1)
            : 0,
          notStartedStudents: parseInt(notStartedCount[0]?.count || 0),
        },
        enrollmentsByMonth,
        revenueByMonth,
        popularCourses,
      },
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
};

// GET /api/admin/analytics/courses
const getCourseAnalytics = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where: { status: 'PUBLISHED' },
        skip,
        take: parseInt(limit),
        orderBy: { totalStudents: 'desc' },
        include: {
          _count: {
            select: { enrollments: true, assessments: true, sections: true },
          },
          enrollments: {
            select: { status: true },
          },
        },
      }),
      prisma.course.count({ where: { status: 'PUBLISHED' } }),
    ]);

    const enriched = courses.map((c) => {
      const completed = c.enrollments.filter((e) => e.status === 'COMPLETED').length;
      const total = c.enrollments.length;
      return {
        id: c.id,
        title: c.title,
        thumbnail: c.thumbnail,
        totalStudents: total,
        completedStudents: completed,
        completionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0,
        assessmentCount: c._count.assessments,
        sectionCount: c._count.sections,
      };
    });

    res.json({
      success: true,
      data: {
        courses: enriched,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch course analytics.' });
  }
};

// GET /api/admin/analytics/students-at-risk
const getAtRiskStudents = async (req, res) => {
  try {
    // Students enrolled but haven't made any content progress in last 14 days
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const atRisk = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        progressPercent: { lt: 10 },
        enrolledAt: { lt: cutoff },
      },
      take: 50,
      orderBy: { enrolledAt: 'asc' },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true,
            username: true, email: true, guardianEmail: true,
          },
        },
        course: { select: { id: true, title: true, thumbnail: true } },
      },
    });

    res.json({ success: true, data: atRisk });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch at-risk students.' });
  }
};

// GET /api/admin/analytics/class-report/:classId
const getClassReport = async (req, res) => {
  try {
    const { classId } = req.params;

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        studentBatches: {
          include: {
            student: {
              select: {
                id: true, firstName: true, lastName: true, username: true,
                lastLogin: true, isActive: true,
                enrollments: {
                  select: {
                    course: { select: { title: true } },
                    status: true,
                    progressPercent: true,
                    enrolledAt: true,
                  },
                },
                assessmentAttempts: {
                  orderBy: { completedAt: 'desc' },
                  take: 5,
                  select: {
                    score: true, isPassed: true, completedAt: true,
                    assessment: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
        school: { select: { name: true } },
        academicYear: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });

    res.json({ success: true, data: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch class report.' });
  }
};

// GET /api/admin/analytics/export/students  (CSV)
const exportStudentsCSV = async (req, res) => {
  try {
    const { schoolId, classId } = req.query;

    let userIds = null;

    if (classId) {
      const batches = await prisma.studentBatch.findMany({
        where: { classId },
        select: { studentId: true },
      });
      userIds = batches.map((b) => b.studentId);
    }

    const students = await prisma.user.findMany({
      where: {
        ...(schoolId && !classId ? schoolStudentWhere(schoolId) : { role: 'STUDENT' }),
        ...(userIds && { id: { in: userIds } }),
      },
      select: {
        firstName: true, lastName: true, username: true,
        email: true, guardianEmail: true, guardianPhone: true,
        isActive: true, createdAt: true, lastLogin: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sanitizeCSVCell = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Neutralize formula triggers: =, +, -, @, \t, \r
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'firstName', 'lastName', 'studentId', 'guardianEmail',
      'guardianPhone', 'isActive', 'enrollments', 'certificates',
      'createdAt', 'lastLogin',
    ];

    const rows = students.map((s) => [
      sanitizeCSVCell(s.firstName),
      sanitizeCSVCell(s.lastName),
      sanitizeCSVCell(s.username),
      sanitizeCSVCell(s.guardianEmail || ''),
      sanitizeCSVCell(s.guardianPhone || ''),
      sanitizeCSVCell(s.isActive ? 'Yes' : 'No'),
      sanitizeCSVCell(s._count.enrollments),
      sanitizeCSVCell(s._count.certificates),
      sanitizeCSVCell(s.createdAt.toISOString().split('T')[0]),
      sanitizeCSVCell(s.lastLogin ? s.lastLogin.toISOString().split('T')[0] : 'Never'),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="students_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export.' });
  }
};

module.exports = {
  getOverview,
  getCourseAnalytics,
  getAtRiskStudents,
  getClassReport,
  exportStudentsCSV,
};
