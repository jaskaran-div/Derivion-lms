const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/database');

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
  _count: { select: { enrollments: true } },
  enrollments: {
    include: { course: { select: { id: true, title: true, slug: true } } },
  },
};

const generateUsername = async () => {
  for (let i = 0; i < 12; i++) {
    const username = `drv${crypto.randomInt(100000, 999999)}`;
    const exists = await prisma.user.findUnique({ where: { username } });
    if (!exists) return username;
  }
  return `drv${Date.now().toString().slice(-8)}`;
};

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[crypto.randomInt(0, chars.length)];
  return pwd;
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
      where: { status: 'PUBLISHED' },
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

    const username = await generateUsername();
    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    const email = `${username}@students.derivion.local`;

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

    const enrolled = [];
    if (Array.isArray(courseIds) && courseIds.length) {
      for (const courseId of courseIds) {
        try {
          await prisma.enrollment.create({ data: { userId: student.id, courseId } });
          await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
          enrolled.push(courseId);
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
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: student.id, courseId } },
    });
    if (existing) return res.status(409).json({ success: false, message: 'Student already enrolled.' });
    const enrollment = await prisma.enrollment.create({ data: { userId: student.id, courseId } });
    await prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });
    res.status(201).json({ success: true, message: 'Student enrolled.', data: enrollment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to enroll student.' });
  }
};

const listCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, slug: true, thumbnail: true, level: true },
      orderBy: { title: 'asc' },
    });
    res.json({ success: true, data: courses });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// POST /api/teacher/students/:id/reset-password — new one-time password for one of the teacher's own students
const resetStudentPassword = async (req, res) => {
  try {
    const student = await ensureOwnStudent(req.user.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const plainPassword = generatePassword();
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
  generatePassword,
};
