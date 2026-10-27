const prisma = require('../config/database');
const { logAudit } = require('./auditController');
const { schoolStudentWhere, schoolTeacherWhere } = require('../services/learners');
const { sendCSV, isoDate } = require('../utils/csv');

// Student and teacher head-counts per school (students include those created by the school's teachers)
const schoolHeadcounts = async (schoolId) => {
  const [students, activeStudents, teachers] = await Promise.all([
    prisma.user.count({ where: schoolStudentWhere(schoolId) }),
    prisma.user.count({ where: { ...schoolStudentWhere(schoolId), isActive: true } }),
    prisma.user.count({ where: schoolTeacherWhere(schoolId) }),
  ]);
  return { students, activeStudents, teachers };
};

// ==================== SCHOOL CRUD ====================

// GET /api/admin/schools
const listSchools = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
    };

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              memberships: true,
              classes: true,
              courseAssignments: true,
            },
          },
        },
      }),
      prisma.school.count({ where }),
    ]);

    const counts = await Promise.all(schools.map((s) => schoolHeadcounts(s.id)));

    res.json({
      success: true,
      data: {
        schools: schools.map((s, i) => ({ ...s, stats: counts[i] })),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('List schools error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schools.' });
  }
};

// GET /api/admin/schools/:id
const getSchool = async (req, res) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: {
        academicYears: { orderBy: { startDate: 'desc' } },
        classes: {
          include: {
            teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
            _count: { select: { studentBatches: true } },
          },
          orderBy: { name: 'asc' },
        },
        courseAssignments: {
          include: { course: { select: { id: true, title: true, thumbnail: true, status: true } } },
        },
        _count: { select: { memberships: true, classes: true, importJobs: true } },
      },
    });

    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });
    res.json({ success: true, data: school });
  } catch (error) {
    console.error('Get school error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch school.' });
  }
};

// POST /api/admin/schools
const createSchool = async (req, res) => {
  try {
    const { name, code, address, city, state, pincode, phone, email } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'School name and code are required.' });
    }

    const existing = await prisma.school.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A school with this code already exists.' });
    }

    const school = await prisma.school.create({
      data: {
        name: name.trim(),
        code: code.toUpperCase().trim(),
        address, city, state, pincode, phone, email,
      },
    });

    await logAudit({
      userId: req.user.id,
      action: 'SCHOOL_CREATED',
      targetId: school.id,
      targetType: 'school',
      details: { schoolName: school.name, schoolCode: school.code },
      req,
    });

    res.status(201).json({ success: true, message: 'School created.', data: school });
  } catch (error) {
    console.error('Create school error:', error);
    res.status(500).json({ success: false, message: 'Failed to create school.' });
  }
};

// PUT /api/admin/schools/:id
const updateSchool = async (req, res) => {
  try {
    const { name, address, city, state, pincode, phone, email, isActive, settings } = req.body;

    const school = await prisma.school.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(pincode !== undefined && { pincode }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(isActive !== undefined && { isActive }),
        ...(settings !== undefined && { settings }),
      },
    });

    res.json({ success: true, message: 'School updated.', data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update school.' });
  }
};

// DELETE /api/admin/schools/:id
const deleteSchool = async (req, res) => {
  try {
    // Soft delete — just deactivate
    await prisma.school.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true, message: 'School deactivated.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete school.' });
  }
};

// ==================== ACADEMIC YEARS ====================

// GET /api/admin/schools/:id/academic-years
const listAcademicYears = async (req, res) => {
  try {
    const years = await prisma.academicYear.findMany({
      where: { schoolId: req.params.id },
      orderBy: { startDate: 'desc' },
    });
    res.json({ success: true, data: years });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch academic years.' });
  }
};

// POST /api/admin/schools/:id/academic-years
const createAcademicYear = async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Name, start date and end date required.' });
    }

    const year = await prisma.academicYear.create({
      data: {
        schoolId: req.params.id,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    res.status(201).json({ success: true, data: year });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create academic year.' });
  }
};

// ==================== CLASSES ====================

// GET /api/admin/schools/:id/classes
const listClasses = async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      where: { schoolId: req.params.id, isActive: true },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        academicYear: { select: { name: true } },
        teacherAssignments: {
          include: { teacher: { select: { id: true, firstName: true, lastName: true } } },
        },
        _count: { select: { studentBatches: true } },
      },
      orderBy: [{ name: 'asc' }, { section: 'asc' }],
    });
    res.json({ success: true, data: classes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch classes.' });
  }
};

// POST /api/admin/schools/:id/classes
const createClass = async (req, res) => {
  try {
    const { name, section, teacherId, academicYearId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Class name is required.' });

    const cls = await prisma.class.create({
      data: {
        schoolId: req.params.id,
        name,
        section: section || null,
        teacherId: teacherId || null,
        academicYearId: academicYearId || null,
      },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // If teacher specified, also add to TeacherClassAssignment
    if (teacherId) {
      await prisma.teacherClassAssignment.upsert({
        where: { teacherId_classId: { teacherId, classId: cls.id } },
        create: { teacherId, classId: cls.id },
        update: {},
      });
    }

    await logAudit({
      userId: req.user.id,
      action: 'CLASS_ASSIGNED',
      targetId: cls.id,
      targetType: 'class',
      details: { className: cls.name, schoolId: req.params.id },
      req,
    });

    res.status(201).json({ success: true, data: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create class.' });
  }
};

// PUT /api/admin/classes/:id
const updateClass = async (req, res) => {
  try {
    const { name, section, teacherId, academicYearId, isActive } = req.body;

    const cls = await prisma.class.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(section !== undefined && { section }),
        ...(teacherId !== undefined && { teacherId }),
        ...(academicYearId !== undefined && { academicYearId }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update class.' });
  }
};

// ==================== TEACHER ASSIGNMENTS ====================

// POST /api/admin/classes/:id/teachers
const assignTeacherToClass = async (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!teacherId) return res.status(400).json({ success: false, message: 'teacherId required.' });

    // Verify teacher exists
    const teacher = await prisma.user.findUnique({ where: { id: teacherId, role: 'TEACHER' } });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found.' });

    const assignment = await prisma.teacherClassAssignment.upsert({
      where: { teacherId_classId: { teacherId, classId: req.params.id } },
      create: { teacherId, classId: req.params.id },
      update: {},
    });

    res.json({ success: true, message: 'Teacher assigned.', data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign teacher.' });
  }
};

// DELETE /api/admin/classes/:classId/teachers/:teacherId
const removeTeacherFromClass = async (req, res) => {
  try {
    await prisma.teacherClassAssignment.deleteMany({
      where: { teacherId: req.params.teacherId, classId: req.params.classId },
    });
    res.json({ success: true, message: 'Teacher removed from class.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove teacher.' });
  }
};

// ==================== COURSE ASSIGNMENTS ====================

// POST /api/admin/schools/:id/courses
const assignCourseToSchool = async (req, res) => {
  try {
    const { courseId } = req.body;
    const assignment = await prisma.schoolCourseAssignment.upsert({
      where: { schoolId_courseId: { schoolId: req.params.id, courseId } },
      create: { schoolId: req.params.id, courseId },
      update: {},
    });
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign course to school.' });
  }
};

// POST /api/admin/classes/:id/courses
const assignCourseToClass = async (req, res) => {
  try {
    const { courseId } = req.body;
    const assignment = await prisma.classCourseAssignment.upsert({
      where: { classId_courseId: { classId: req.params.id, courseId } },
      create: { classId: req.params.id, courseId },
      update: {},
    });
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign course to class.' });
  }
};

// ==================== STUDENT BATCH MANAGEMENT ====================

// GET /api/admin/classes/:id/students
const listClassStudents = async (req, res) => {
  try {
    const batches = await prisma.studentBatch.findMany({
      where: { classId: req.params.id },
      include: {
        student: {
          select: {
            id: true, firstName: true, lastName: true, username: true,
            email: true, isActive: true, lastLogin: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    res.json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch class students.' });
  }
};

// POST /api/admin/classes/:id/students
const addStudentToClass = async (req, res) => {
  try {
    const { studentId } = req.body;
    const batch = await prisma.studentBatch.upsert({
      where: { classId_studentId: { classId: req.params.id, studentId } },
      create: { classId: req.params.id, studentId },
      update: {},
    });
    res.json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add student to class.' });
  }
};

// DELETE /api/admin/classes/:classId/students/:studentId
const removeStudentFromClass = async (req, res) => {
  try {
    await prisma.studentBatch.deleteMany({
      where: { classId: req.params.classId, studentId: req.params.studentId },
    });
    res.json({ success: true, message: 'Student removed from class.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove student.' });
  }
};

// ==================== SCHOOL ANALYTICS ====================

// GET /api/admin/schools/:id/analytics
const getSchoolAnalytics = async (req, res) => {
  try {
    const schoolId = req.params.id || req.params.schoolId;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'School ID is required.' });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const { startDate, endDate } = req.query;

    const dateFilter = startDate && endDate
      ? { gte: new Date(startDate), lte: new Date(endDate) }
      : undefined;

    // Get all students in this school
    const schoolStudents = await prisma.user.findMany({ where: schoolStudentWhere(schoolId), select: { id: true } });
    const studentIds = schoolStudents.map((m) => m.id);

    const [
      totalStudents,
      activeStudents,
      totalEnrollments,
      completedEnrollments,
      assessmentStats,
      classStats,
    ] = await Promise.all([
      Promise.resolve(studentIds.length),

      prisma.user.count({ where: { id: { in: studentIds }, isActive: true } }),

      prisma.enrollment.count({ where: { userId: { in: studentIds } } }),

      prisma.enrollment.count({
        where: { userId: { in: studentIds }, status: 'COMPLETED' },
      }),

      prisma.assessmentAttempt.aggregate({
        where: {
          userId: { in: studentIds },
          ...(dateFilter && { completedAt: dateFilter }),
        },
        _avg: { score: true },
        _count: { id: true },
      }),

      prisma.class.findMany({
        where: { schoolId },
        include: {
          _count: { select: { studentBatches: true } },
          teacherAssignments: {
            include: { teacher: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    // Students who haven't started any course
    const enrolledStudentIds = await prisma.enrollment.findMany({
      where: { userId: { in: studentIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const notStartedCount = studentIds.length - enrolledStudentIds.length;

    res.json({
      success: true,
      data: {
        summary: {
          totalStudents,
          activeStudents,
          totalEnrollments,
          completedEnrollments,
          completionRate: totalEnrollments > 0
            ? ((completedEnrollments / totalEnrollments) * 100).toFixed(1)
            : 0,
          avgAssessmentScore: assessmentStats._avg.score
            ? parseFloat(assessmentStats._avg.score).toFixed(1)
            : 0,
          totalAttempts: assessmentStats._count.id,
          notStartedCount,
        },
        classes: classStats,
      },
    });
  } catch (error) {
    console.error('School analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
};

// ==================== SCHOOL OVERVIEW & EXPORTS ====================

const overviewStudentSelect = {
  id: true, firstName: true, lastName: true, username: true, email: true,
  guardianEmail: true, guardianPhone: true, isActive: true, lastLogin: true, createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  studentBatches: { where: { class: { isActive: true } }, select: { class: { select: { id: true, name: true, section: true, schoolId: true } } } },
  enrollments: {
    where: { status: { not: 'REFUNDED' } },
    select: {
      status: true, progressPercent: true, enrolledAt: true, completedAt: true, lastAccessedAt: true,
      course: { select: { id: true, title: true } },
    },
  },
  certificates: { select: { certificateId: true, certificateNo: true, issuedAt: true, course: { select: { title: true } } } },
};

const summarizeStudent = (st, schoolId) => {
  const enrollments = st.enrollments.map((e) => ({ ...e, progressPercent: Number(e.progressPercent) }));
  const lastAccess = Math.max(
    st.lastLogin ? st.lastLogin.getTime() : 0,
    ...enrollments.map((e) => (e.lastAccessedAt ? e.lastAccessedAt.getTime() : 0)),
  );
  return {
    ...st,
    enrollments,
    classes: st.studentBatches.filter((b) => b.class.schoolId === schoolId).map((b) => b.class),
    studentBatches: undefined,
    averageProgress: enrollments.length ? enrollments.reduce((s, e) => s + e.progressPercent, 0) / enrollments.length : 0,
    completedCourses: enrollments.filter((e) => e.status === 'COMPLETED').length,
    lastActive: lastAccess ? new Date(lastAccess) : null,
  };
};

const loadSchoolStudents = async (schoolId) => {
  const students = await prisma.user.findMany({
    where: schoolStudentWhere(schoolId),
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 2000,
    select: overviewStudentSelect,
  });
  return students.map((st) => summarizeStudent(st, schoolId));
};

// GET /api/admin/schools/:id/overview — everything the school page shows: students with progress, teachers, course uptake
const getSchoolOverview = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });

    const [students, teachers] = await Promise.all([
      loadSchoolStudents(schoolId),
      prisma.user.findMany({
        where: schoolTeacherWhere(schoolId),
        orderBy: { firstName: 'asc' },
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true, lastLogin: true,
          teacherAssignments: { where: { class: { schoolId } }, select: { class: { select: { id: true, name: true, section: true } } } },
          _count: { select: { createdStudents: true } },
        },
      }),
    ]);

    // Course uptake across the school's students
    const courses = new Map();
    for (const st of students) {
      for (const e of st.enrollments) {
        const c = courses.get(e.course.id) || { id: e.course.id, title: e.course.title, enrolled: 0, completed: 0, progressSum: 0 };
        c.enrolled += 1;
        c.progressSum += e.progressPercent;
        if (e.status === 'COMPLETED') c.completed += 1;
        courses.set(c.id, c);
      }
    }
    const courseStats = [...courses.values()]
      .map(({ progressSum, ...c }) => ({ ...c, averageProgress: c.enrolled ? progressSum / c.enrolled : 0 }))
      .sort((a, b) => b.enrolled - a.enrolled);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const totalEnrollments = students.reduce((s, st) => s + st.enrollments.length, 0);
    const completedEnrollments = students.reduce((s, st) => s + st.completedCourses, 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalStudents: students.length,
          activeStudents: students.filter((s) => s.isActive).length,
          activeThisWeek: students.filter((s) => s.lastActive && s.lastActive.getTime() >= weekAgo).length,
          neverLoggedIn: students.filter((s) => !s.lastLogin).length,
          notStarted: students.filter((s) => s.enrollments.length === 0).length,
          totalTeachers: teachers.length,
          totalEnrollments,
          completedEnrollments,
          certificatesIssued: students.reduce((s, st) => s + st.certificates.length, 0),
          completionRate: totalEnrollments ? (completedEnrollments / totalEnrollments) * 100 : 0,
          averageProgress: students.length ? students.reduce((s, st) => s + st.averageProgress, 0) / students.length : 0,
        },
        students,
        teachers: teachers.map(({ teacherAssignments, _count, ...t }) => ({
          ...t,
          classes: teacherAssignments.map((a) => a.class),
          studentsCreated: _count.createdStudents,
        })),
        courseStats,
      },
    });
  } catch (error) {
    console.error('School overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load school details.' });
  }
};

// GET /api/admin/schools/:id/export — CSV of the school's students with their progress
const exportSchoolStudents = async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.params.id }, select: { code: true } });
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });
    const students = await loadSchoolStudents(req.params.id);
    sendCSV(
      res,
      `school-${school.code}-students_${isoDate(new Date())}.csv`,
      ['First name', 'Last name', 'Login ID', 'Guardian email', 'Guardian phone', 'Classes', 'Added by', 'Status',
        'Courses', 'Completed courses', 'Average progress %', 'Certificates', 'Course progress', 'Last active', 'Joined'],
      students.map((s) => [
        s.firstName, s.lastName, s.username || s.email, s.guardianEmail, s.guardianPhone,
        s.classes.map((c) => `${c.name}${c.section ? ` ${c.section}` : ''}`).join(', '),
        s.createdBy ? `${s.createdBy.firstName} ${s.createdBy.lastName}` : '',
        s.isActive ? 'Active' : 'Inactive',
        s.enrollments.length, s.completedCourses, s.averageProgress.toFixed(1), s.certificates.length,
        s.enrollments.map((e) => `${e.course.title} (${e.progressPercent.toFixed(0)}%)`).join('; '),
        s.lastActive ? s.lastActive.toISOString() : 'Never', isoDate(s.createdAt),
      ])
    );
  } catch (error) {
    console.error('Export school students error:', error);
    res.status(500).json({ success: false, message: 'Failed to export students.' });
  }
};

// GET /api/admin/schools/export — CSV of every school with its details and head-counts
const exportSchools = async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { classes: true, courseAssignments: true } } },
    });
    const stats = await Promise.all(schools.map(async (s) => {
      const students = await prisma.user.findMany({ where: schoolStudentWhere(s.id), select: { id: true } });
      const ids = students.map((x) => x.id);
      const [heads, enrollments, completed, certificates] = await Promise.all([
        schoolHeadcounts(s.id),
        prisma.enrollment.count({ where: { userId: { in: ids }, status: { not: 'REFUNDED' } } }),
        prisma.enrollment.count({ where: { userId: { in: ids }, status: 'COMPLETED' } }),
        prisma.certificate.count({ where: { userId: { in: ids } } }),
      ]);
      return { ...heads, enrollments, completed, certificates };
    }));

    await logAudit({ userId: req.user.id, action: 'ADMIN_ACTION', details: { action: 'SCHOOLS_EXPORT', rows: schools.length }, req });

    sendCSV(
      res,
      `schools_${isoDate(new Date())}.csv`,
      ['Name', 'Code', 'Status', 'Address', 'City', 'State', 'Pincode', 'Phone', 'Email', 'Students', 'Active students',
        'Teachers', 'Classes', 'Assigned courses', 'Enrollments', 'Completed enrollments', 'Completion %', 'Certificates', 'Created'],
      schools.map((s, i) => {
        const st = stats[i];
        return [
          s.name, s.code, s.isActive ? 'Active' : 'Inactive', s.address, s.city, s.state, s.pincode, s.phone, s.email,
          st.students, st.activeStudents, st.teachers, s._count.classes, s._count.courseAssignments,
          st.enrollments, st.completed, st.enrollments ? ((st.completed / st.enrollments) * 100).toFixed(1) : '0.0',
          st.certificates, isoDate(s.createdAt),
        ];
      })
    );
  } catch (error) {
    console.error('Export schools error:', error);
    res.status(500).json({ success: false, message: 'Failed to export schools.' });
  }
};

// ==================== SCHOOL MEMBERS ====================

// GET /api/admin/schools/:id/members
const listSchoolMembers = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const { role, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      schoolId,
      ...(role && role !== 'ALL' && { role }),
      ...(search && {
        user: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [memberships, total] = await Promise.all([
      prisma.schoolMembership.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { joinedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              username: true,
              avatar: true,
              role: true,
              isActive: true,
              createdAt: true,
              studentBatches: {
                where: { class: { schoolId } },
                include: { class: { select: { id: true, name: true, section: true } } },
              },
              teacherAssignments: {
                where: { class: { schoolId } },
                include: { class: { select: { id: true, name: true, section: true } } },
              },
            },
          },
        },
      }),
      prisma.schoolMembership.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        members: memberships,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('List school members error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch school members.' });
  }
};

// POST /api/admin/schools/:id/members
const addSchoolMember = async (req, res) => {
  try {
    const schoolId = req.params.id;
    const { userId, email, role = 'STUDENT' } = req.body;

    let targetUserId = userId;
    if (!targetUserId && email) {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User with this email not found.' });
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID or valid email is required.' });
    }

    const membership = await prisma.schoolMembership.upsert({
      where: {
        schoolId_userId: { schoolId, userId: targetUserId },
      },
      create: {
        schoolId,
        userId: targetUserId,
        role: role.toUpperCase(),
        isActive: true,
      },
      update: {
        role: role.toUpperCase(),
        isActive: true,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true, avatar: true },
        },
      },
    });

    res.status(201).json({ success: true, data: membership });
  } catch (error) {
    console.error('Add school member error:', error);
    res.status(500).json({ success: false, message: 'Failed to add school member.' });
  }
};

// DELETE /api/admin/schools/:id/members/:userId
const removeSchoolMember = async (req, res) => {
  try {
    const { id: schoolId, userId } = req.params;
    await prisma.schoolMembership.deleteMany({
      where: { schoolId, userId },
    });
    res.json({ success: true, message: 'Member removed from school.' });
  } catch (error) {
    console.error('Remove school member error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove school member.' });
  }
};

module.exports = {
  listSchools, getSchool, createSchool, updateSchool, deleteSchool,
  listAcademicYears, createAcademicYear,
  listClasses, createClass, updateClass,
  assignTeacherToClass, removeTeacherFromClass,
  assignCourseToSchool, assignCourseToClass,
  listClassStudents, addStudentToClass, removeStudentFromClass,
  getSchoolAnalytics, getSchoolOverview, exportSchoolStudents, exportSchools,
  listSchoolMembers, addSchoolMember, removeSchoolMember,
};
