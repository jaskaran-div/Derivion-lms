const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { generateUsername, generatePassword, studentEmail } = require('../utils/credentials');
const { teacherSchoolId, linkLearnerToSchool } = require('../services/learners');
const { notifyEnrollment } = require('../services/notify');

// Courses a teacher can use: those assigned to their school(s) or classes.
// A teacher with no assignments yet keeps access to the whole published catalog.
const teacherCourseWhere = async (teacherId) => {
  const [memberships, classLinks] = await Promise.all([
    prisma.schoolMembership.findMany({ where: { userId: teacherId, isActive: true }, select: { schoolId: true } }),
    prisma.class.findMany({
      where: { OR: [{ teacherId }, { teacherAssignments: { some: { teacherId } } }] },
      select: { id: true, schoolId: true },
    }),
  ]);
  const schoolIds = [...new Set([...memberships.map((m) => m.schoolId), ...classLinks.map((c) => c.schoolId)])];
  const classIds = classLinks.map((c) => c.id);
  const scoped = {
    status: 'PUBLISHED',
    OR: [
      { schoolAssignments: { some: { schoolId: { in: schoolIds } } } },
      { classAssignments: { some: { classId: { in: classIds } } } },
    ],
  };
  const hasAssignments = (schoolIds.length || classIds.length) && await prisma.course.count({ where: scoped });
  return hasAssignments ? scoped : { status: 'PUBLISHED' };
};

const canUseCourse = async (teacherId, courseId) =>
  Boolean(courseId) && Boolean(await prisma.course.findFirst({ where: { id: courseId, ...(await teacherCourseWhere(teacherId)) }, select: { id: true } }));

const studentSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  phone: true,
  guardianEmail: true,
  guardianPhone: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLogin: true,
  createdById: true,
  _count: { select: { enrollments: true, certificates: true } },
  enrollments: {
    include: { course: { select: { id: true, title: true, slug: true } } },
  },
  studentBatches: { select: { class: { select: { id: true, name: true, section: true } } } },
};

const ensureOwnStudent = async (teacherId, studentId) => {
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.createdById !== teacherId || student.role !== 'STUDENT') {
    return null;
  }
  return student;
};

const getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const [totalStudents, activeStudents, recentStudents] = await Promise.all([
      prisma.user.count({ where: { createdById: teacherId, role: 'STUDENT' } }),
      prisma.user.count({ where: { createdById: teacherId, role: 'STUDENT', isActive: true } }),
      prisma.user.findMany({
        where: { createdById: teacherId, role: 'STUDENT' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: studentSelect,
      }),
    ]);

    const publishedCourses = await prisma.course.findMany({
      where: await teacherCourseWhere(teacherId),
      select: { id: true, title: true, thumbnail: true, totalStudents: true },
      orderBy: { title: 'asc' },
      take: 10,
    });

    res.json({
      success: true,
      data: {
        stats: { totalStudents, activeStudents },
        recentStudents,
        publishedCourses,
      },
    });
  } catch (error) {
    console.error('Teacher dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
};

const listStudents = async (req, res) => {
  try {
    const { search } = req.query;
    const where = {
      createdById: req.user.id,
      role: 'STUDENT',
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { guardianEmail: { contains: search, mode: 'insensitive' } },
          { guardianPhone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const students = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: studentSelect,
    });

    // Activity report: total watch time per student plus derived progress / last activity
    const watch = students.length
      ? await prisma.contentProgress.groupBy({
        by: ['userId'],
        where: { userId: { in: students.map((st) => st.id) } },
        _sum: { watchedSeconds: true },
        _count: { _all: true },
      })
      : [];
    const watchBy = Object.fromEntries(watch.map((w) => [w.userId, w._sum.watchedSeconds || 0]));

    const data = students.map((st) => {
      const active = st.enrollments.filter((e) => e.status !== 'REFUNDED');
      const lastAccess = active.map((e) => e.lastAccessedAt).filter(Boolean).map((d) => new Date(d).getTime());
      const lastActive = Math.max(st.lastLogin ? new Date(st.lastLogin).getTime() : 0, ...lastAccess, 0);
      return {
        ...st,
        report: {
          averageProgress: active.length ? active.reduce((sum, e) => sum + Number(e.progressPercent), 0) / active.length : 0,
          completedCourses: active.filter((e) => e.status === 'COMPLETED').length,
          watchSeconds: watchBy[st.id] || 0,
          lastActive: lastActive ? new Date(lastActive) : null,
        },
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('List students error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
};

const createStudent = async (req, res) => {
  try {
    const { firstName, lastName, guardianEmail, guardianPhone, courseIds } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Student first and last name are required.' });
    }
    if (!guardianEmail && !guardianPhone) {
      return res.status(400).json({ success: false, message: 'Provide guardian email or contact number.' });
    }

    const username = await generateUsername(firstName, lastName);
    const plainPassword = generatePassword(firstName, lastName);
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    const email = studentEmail(username);

    const student = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: guardianPhone || null,
        guardianEmail: guardianEmail || null,
        guardianPhone: guardianPhone || null,
        role: 'STUDENT',
        createdById: req.user.id,
      },
      select: studentSelect,
    });

    // The new learner belongs to the teacher's school, so the school sees them
    await linkLearnerToSchool(student.id, await teacherSchoolId(req.user.id));

    const enrolled = [];
    if (Array.isArray(courseIds) && courseIds.length) {
      for (const courseId of courseIds) {
        if (!(await canUseCourse(req.user.id, courseId))) continue;
        try {
          await prisma.enrollment.create({ data: { userId: student.id, courseId } });
          await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
          enrolled.push(courseId);
          notifyEnrollment(student.id, courseId).catch(() => {});
        } catch {
          // skip duplicates / invalid ids
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Student created. Save this password now — it will not be shown again.',
      data: {
        student,
        credentials: {
          studentId: username,
          password: plainPassword,
        },
        enrolledCourseIds: enrolled,
      },
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ success: false, message: 'Failed to create student.' });
  }
};

const updateStudent = async (req, res) => {
  try {
    const student = await ensureOwnStudent(req.user.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const { firstName, lastName, guardianEmail, guardianPhone, isActive } = req.body;
    const updated = await prisma.user.update({
      where: { id: student.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(guardianEmail !== undefined && { guardianEmail }),
        ...(guardianPhone !== undefined && { guardianPhone, phone: guardianPhone }),
        ...(isActive !== undefined && { isActive }),
      },
      select: studentSelect,
    });

    res.json({ success: true, message: 'Student updated.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update student.' });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const student = await ensureOwnStudent(req.user.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    await prisma.user.delete({ where: { id: student.id } });
    res.json({ success: true, message: 'Student deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete student.' });
  }
};

const enrollStudent = async (req, res) => {
  try {
    const student = await ensureOwnStudent(req.user.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    const { courseId } = req.body;
    if (!(await canUseCourse(req.user.id, courseId))) {
      return res.status(403).json({ success: false, message: 'This course is not available to your school.' });
    }
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: student.id, courseId } },
    });
    if (existing) return res.status(409).json({ success: false, message: 'Student already enrolled.' });
    const enrollment = await prisma.enrollment.create({ data: { userId: student.id, courseId } });
    await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
    notifyEnrollment(student.id, courseId).catch(() => {});
    res.status(201).json({ success: true, message: 'Student enrolled.', data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to enroll student.' });
  }
};

const listCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: await teacherCourseWhere(req.user.id),
      select: { id: true, title: true, slug: true, thumbnail: true, level: true },
      orderBy: { title: 'asc' },
    });
    res.json({ success: true, data: courses });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// GET /api/teacher/my-courses — the courses this teacher can use, with how their own students are doing in each
const getMyCourses = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const courses = await prisma.course.findMany({
      where: await teacherCourseWhere(teacherId),
      orderBy: { title: 'asc' },
      select: {
        id: true, title: true, slug: true, thumbnail: true, shortDesc: true, level: true, language: true,
        totalLessons: true, totalDuration: true, updatedAt: true,
        category: { select: { name: true } },
        schoolAssignments: { select: { school: { select: { name: true } } } },
        enrollments: {
          where: { user: { createdById: teacherId, role: 'STUDENT' }, status: { not: 'REFUNDED' } },
          select: { status: true, progressPercent: true },
        },
      },
    });

    res.json({
      success: true,
      data: courses.map(({ enrollments, schoolAssignments, ...c }) => ({
        ...c,
        assignedVia: schoolAssignments.map((a) => a.school.name),
        myStudents: enrollments.length,
        completed: enrollments.filter((e) => e.status === 'COMPLETED').length,
        averageProgress: enrollments.length
          ? enrollments.reduce((s, e) => s + Number(e.progressPercent), 0) / enrollments.length
          : 0,
      })),
    });
  } catch (error) {
    console.error('Teacher my courses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// GET /api/teacher/students/:id — full profile of one of the teacher's students
const getStudent = async (req, res) => {
  try {
    const student = await prisma.user.findFirst({
      where: { id: req.params.id, createdById: req.user.id, role: 'STUDENT' },
      select: {
        id: true, firstName: true, lastName: true, username: true, phone: true,
        guardianEmail: true, guardianPhone: true, isActive: true, createdAt: true, lastLogin: true,
        schoolMemberships: { select: { school: { select: { name: true, code: true } } } },
        studentBatches: { select: { class: { select: { name: true, section: true } } } },
        enrollments: {
          orderBy: { enrolledAt: 'desc' },
          select: {
            id: true, status: true, progressPercent: true, enrolledAt: true, completedAt: true, lastAccessedAt: true,
            course: { select: { id: true, title: true, slug: true, thumbnail: true } },
          },
        },
        certificates: {
          orderBy: { issuedAt: 'desc' },
          select: { id: true, certificateId: true, certificateNo: true, issuedAt: true, course: { select: { id: true, title: true } } },
        },
        assessmentAttempts: {
          where: { status: 'SUBMITTED' },
          orderBy: { completedAt: 'desc' },
          take: 20,
          select: { id: true, score: true, isPassed: true, completedAt: true, assessment: { select: { title: true } } },
        },
      },
    });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const [lessons, watch, activity] = await Promise.all([
      prisma.contentProgress.findMany({
        where: { userId: student.id, isCompleted: true },
        select: { content: { select: { section: { select: { courseId: true } } } } },
      }),
      prisma.contentProgress.aggregate({ where: { userId: student.id }, _sum: { watchedSeconds: true } }),
      prisma.auditLog.findMany({
        where: { userId: student.id, action: { in: ['LOGIN', 'LOGOUT', 'ACTIVITY'] } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, action: true, details: true, createdAt: true },
      }),
    ]);
    const lessonsByCourse = {};
    for (const l of lessons) {
      const id = l.content.section.courseId;
      lessonsByCourse[id] = (lessonsByCourse[id] || 0) + 1;
    }
    const totals = await prisma.content.groupBy({
      by: ['sectionId'],
      where: { isPublished: true, section: { isPublished: true, courseId: { in: student.enrollments.map((e) => e.course.id) } } },
      _count: { _all: true },
    });
    const sections = await prisma.section.findMany({ where: { id: { in: totals.map((t) => t.sectionId) } }, select: { id: true, courseId: true } });
    const courseOf = Object.fromEntries(sections.map((s) => [s.id, s.courseId]));
    const lessonTotals = {};
    for (const t of totals) lessonTotals[courseOf[t.sectionId]] = (lessonTotals[courseOf[t.sectionId]] || 0) + t._count._all;

    res.json({
      success: true,
      data: {
        ...student,
        enrollments: student.enrollments.map((e) => ({
          ...e,
          lessonsCompleted: lessonsByCourse[e.course.id] || 0,
          lessonsTotal: lessonTotals[e.course.id] || 0,
          certificate: student.certificates.find((c) => c.course.id === e.course.id) || null,
        })),
        watchSeconds: watch._sum.watchedSeconds || 0,
        recentActivity: activity,
      },
    });
  } catch (error) {
    console.error('Teacher get student error:', error);
    res.status(500).json({ success: false, message: 'Failed to load student.' });
  }
};

// POST /api/teacher/students/:id/reset-password — new one-time password for one of the teacher's own students
const resetStudentPassword = async (req, res) => {
  try {
    const student = await ensureOwnStudent(req.user.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const plainPassword = generatePassword(student.firstName, student.lastName);
    await prisma.user.update({
      where: { id: student.id },
      // Saved hashed; existing sessions are signed out so only the new password works
      data: { password: await bcrypt.hash(plainPassword, 12), passwordChangedAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Password reset. Share it with the student now — it will not be shown again.',
      data: {
        credentials: { studentId: student.username || student.email, password: plainPassword },
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      },
    });
  } catch (error) {
    console.error('Reset student password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

module.exports = {
  resetStudentPassword,
  getDashboard,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  enrollStudent,
  listCourses,
  getMyCourses,
  getStudent,
  generatePassword,
};
