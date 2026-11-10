// Course sheets (e.g. a daily diary): admins upload the template, each enrolled learner keeps their own rows.
const prisma = require('../config/database');
const { getActiveEnrollment } = require('../services/progress');
const {
  MAX_ROWS_PER_LEARNER, SheetInputError,
  headersFromFile, buildColumns, cleanRowData, buildWorkbook, learnerName, learnerLogin,
} = require('../services/courseSheets');

const USER_FIELDS = { id: true, firstName: true, lastName: true, email: true, username: true, avatar: true };

const fail = (res, error, fallback) => {
  if (error instanceof SheetInputError) return res.status(400).json({ success: false, message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
};

const publicSheet = (s) => ({
  id: s.id, courseId: s.courseId, title: s.title, description: s.description,
  columns: s.columns, order: s.order, isPublished: s.isPublished, createdAt: s.createdAt, updatedAt: s.updatedAt,
});

const cleanTitle = (raw) => String(raw || '').trim().slice(0, 150);

// Columns come from an uploaded .xlsx/.csv template, or from a typed list ("Date, Trade, Notes")
const columnsFromRequest = async (req, previous) => {
  if (req.file) return buildColumns(await headersFromFile(req.file), previous);
  if (req.body.columns !== undefined) {
    const labels = Array.isArray(req.body.columns) ? req.body.columns : String(req.body.columns).split(',');
    return buildColumns(labels, previous);
  }
  return null;
};

// ==================== ADMIN ====================

// GET /api/courses/admin/:courseId/sheets
const adminListSheets = async (req, res) => {
  try {
    const sheets = await prisma.courseSheet.findMany({
      where: { courseId: req.params.courseId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { rows: true } } },
    });
    const learners = await prisma.sheetRow.groupBy({
      by: ['sheetId', 'userId'],
      where: { sheetId: { in: sheets.map((s) => s.id) } },
    });
    const learnerCount = learners.reduce((m, r) => m.set(r.sheetId, (m.get(r.sheetId) || 0) + 1), new Map());
    res.json({
      success: true,
      data: sheets.map((s) => ({ ...publicSheet(s), rowCount: s._count.rows, learnerCount: learnerCount.get(s.id) || 0 })),
    });
  } catch (error) {
    fail(res, error, 'Failed to load course sheets.');
  }
};

// POST /api/courses/admin/:courseId/sheets  (multipart: file?, title, description?, columns?)
const adminCreateSheet = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { id: true } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    const title = cleanTitle(req.body.title) || cleanTitle((req.file?.originalname || '').replace(/\.(xlsx|csv)$/i, ''));
    if (!title) return res.status(400).json({ success: false, message: 'Give the sheet a name.' });
    const columns = await columnsFromRequest(req, []);
    if (!columns) return res.status(400).json({ success: false, message: 'Upload a template file or type the column names.' });
    const last = await prisma.courseSheet.findFirst({ where: { courseId: course.id }, orderBy: { order: 'desc' }, select: { order: true } });
    const sheet = await prisma.courseSheet.create({
      data: {
        courseId: course.id, title, columns,
        description: req.body.description ? String(req.body.description).slice(0, 2000) : null,
        order: (last?.order ?? -1) + 1,
      },
    });
    res.status(201).json({ success: true, data: publicSheet(sheet) });
  } catch (error) {
    fail(res, error, 'Failed to create the sheet.');
  }
};

// PUT /api/courses/admin/sheets/:id  (multipart: file? replaces the template; title, description, isPublished, columns)
const adminUpdateSheet = async (req, res) => {
  try {
    const sheet = await prisma.courseSheet.findUnique({ where: { id: req.params.id } });
    if (!sheet) return res.status(404).json({ success: false, message: 'Sheet not found.' });
    const data = {};
    if (req.body.title !== undefined) {
      data.title = cleanTitle(req.body.title);
      if (!data.title) return res.status(400).json({ success: false, message: 'Give the sheet a name.' });
    }
    if (req.body.description !== undefined) data.description = req.body.description ? String(req.body.description).slice(0, 2000) : null;
    if (req.body.isPublished !== undefined) data.isPublished = req.body.isPublished === true || req.body.isPublished === 'true';
    const columns = await columnsFromRequest(req, sheet.columns);
    if (columns) data.columns = columns;
    const updated = await prisma.courseSheet.update({ where: { id: sheet.id }, data });
    res.json({ success: true, data: publicSheet(updated) });
  } catch (error) {
    fail(res, error, 'Failed to update the sheet.');
  }
};

// DELETE /api/courses/admin/sheets/:id  (also deletes every learner's rows)
const adminDeleteSheet = async (req, res) => {
  try {
    await prisma.courseSheet.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Sheet deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Sheet not found.' });
    fail(res, error, 'Failed to delete the sheet.');
  }
};

// Enrolled learners plus anyone who already has rows (e.g. their enrollment was later removed)
const sheetLearners = async (sheet) => {
  const [enrollments, counts] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: sheet.courseId, user: { role: 'STUDENT' } },
      select: { status: true, user: { select: USER_FIELDS } },
    }),
    prisma.sheetRow.groupBy({ by: ['userId'], where: { sheetId: sheet.id }, _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  const byUser = new Map(enrollments.map((e) => [e.user.id, { user: e.user, enrollmentStatus: e.status }]));
  const missing = counts.filter((c) => !byUser.has(c.userId)).map((c) => c.userId);
  if (missing.length) {
    const users = await prisma.user.findMany({ where: { id: { in: missing } }, select: USER_FIELDS });
    users.forEach((u) => byUser.set(u.id, { user: u, enrollmentStatus: null }));
  }
  const countMap = new Map(counts.map((c) => [c.userId, c]));
  return [...byUser.values()]
    .map((l) => ({
      ...l,
      rowCount: countMap.get(l.user.id)?._count._all || 0,
      lastEntryAt: countMap.get(l.user.id)?._max.updatedAt || null,
    }))
    .sort((a, b) => (b.lastEntryAt ? +new Date(b.lastEntryAt) : 0) - (a.lastEntryAt ? +new Date(a.lastEntryAt) : 0)
      || learnerName(a.user).localeCompare(learnerName(b.user)));
};

// GET /api/courses/admin/sheets/:id  → sheet + learner tabs
const adminGetSheet = async (req, res) => {
  try {
    const sheet = await prisma.courseSheet.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { id: true, title: true } } },
    });
    if (!sheet) return res.status(404).json({ success: false, message: 'Sheet not found.' });
    const learners = await sheetLearners(sheet);
    res.json({
      success: true,
      data: {
        sheet: { ...publicSheet(sheet), course: sheet.course },
        learners: learners.map((l) => ({
          id: l.user.id, name: learnerName(l.user), login: learnerLogin(l.user), avatar: l.user.avatar,
          enrollmentStatus: l.enrollmentStatus, rowCount: l.rowCount, lastEntryAt: l.lastEntryAt,
        })),
      },
    });
  } catch (error) {
    fail(res, error, 'Failed to load the sheet.');
  }
};

// GET /api/courses/admin/sheets/:id/learners/:userId  → that learner's rows
const adminGetLearnerRows = async (req, res) => {
  try {
    const rows = await prisma.sheetRow.findMany({
      where: { sheetId: req.params.id, userId: req.params.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    fail(res, error, 'Failed to load the learner’s rows.');
  }
};

// GET /api/courses/admin/sheets/:id/export[?userId=]  → .xlsx (one learner, or every learner with a tab each)
const adminExportSheet = async (req, res) => {
  try {
    const sheet = await prisma.courseSheet.findUnique({ where: { id: req.params.id } });
    if (!sheet) return res.status(404).json({ success: false, message: 'Sheet not found.' });
    const { userId } = req.query;
    let learners = await sheetLearners(sheet);
    if (userId) learners = learners.filter((l) => l.user.id === userId);
    else learners = learners.filter((l) => l.rowCount > 0);
    const rows = await prisma.sheetRow.findMany({
      where: { sheetId: sheet.id, userId: { in: learners.map((l) => l.user.id) } },
      orderBy: { createdAt: 'asc' },
    });
    const byUser = rows.reduce((m, r) => m.set(r.userId, [...(m.get(r.userId) || []), r]), new Map());
    const buffer = await buildWorkbook(sheet, learners.map((l) => ({ user: l.user, rows: byUser.get(l.user.id) || [] })));

    const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'sheet';
    const who = userId && learners[0] ? `-${slug(learnerName(learners[0].user))}` : '';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(sheet.title)}${who}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    fail(res, error, 'Failed to export the sheet.');
  }
};

// ==================== LEARNER ====================

// Sheet the learner may use: published, in a published course they are enrolled in (admins always)
const loadLearnerSheet = async (req, res) => {
  const sheet = await prisma.courseSheet.findUnique({
    where: { id: req.params.id },
    include: { course: { select: { status: true } } },
  });
  const isAdmin = req.user.role === 'ADMIN';
  if (!sheet || (!isAdmin && (!sheet.isPublished || sheet.course.status !== 'PUBLISHED'))) {
    res.status(404).json({ success: false, message: 'Sheet not found.' });
    return null;
  }
  if (!isAdmin && !(await getActiveEnrollment(req.user.id, sheet.courseId))) {
    res.status(403).json({ success: false, message: 'Enroll in this course to use its sheets.' });
    return null;
  }
  return sheet;
};

// GET /api/courses/student/courses/:courseId/sheets  → published sheets with my row count
const learnerListSheets = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (req.user.role !== 'ADMIN' && !(await getActiveEnrollment(req.user.id, courseId))) {
      return res.json({ success: true, data: [] });
    }
    const sheets = await prisma.courseSheet.findMany({
      where: { courseId, isPublished: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { rows: { where: { userId: req.user.id } } } } },
    });
    res.json({ success: true, data: sheets.map((s) => ({ ...publicSheet(s), myRowCount: s._count.rows })) });
  } catch (error) {
    fail(res, error, 'Failed to load sheets.');
  }
};

// GET /api/courses/student/sheets/:id/rows
const learnerGetRows = async (req, res) => {
  try {
    const sheet = await loadLearnerSheet(req, res);
    if (!sheet) return;
    const rows = await prisma.sheetRow.findMany({
      where: { sheetId: sheet.id, userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data: { sheet: publicSheet(sheet), rows } });
  } catch (error) {
    fail(res, error, 'Failed to load your sheet.');
  }
};

// POST /api/courses/student/sheets/:id/rows  { data }
const learnerAddRow = async (req, res) => {
  try {
    const sheet = await loadLearnerSheet(req, res);
    if (!sheet) return;
    const data = cleanRowData(sheet.columns, req.body?.data);
    if (!data) return res.status(400).json({ success: false, message: 'Fill in at least one cell.' });
    const count = await prisma.sheetRow.count({ where: { sheetId: sheet.id, userId: req.user.id } });
    if (count >= MAX_ROWS_PER_LEARNER) return res.status(400).json({ success: false, message: 'This sheet is full.' });
    const row = await prisma.sheetRow.create({
      data: { sheetId: sheet.id, userId: req.user.id, data },
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    fail(res, error, 'Failed to save the row.');
  }
};

// The learner's own row in this sheet, or null after sending 404
const loadOwnRow = async (req, res, sheet) => {
  const row = await prisma.sheetRow.findUnique({ where: { id: req.params.rowId } });
  if (!row || row.sheetId !== sheet.id || row.userId !== req.user.id) {
    res.status(404).json({ success: false, message: 'Row not found.' });
    return null;
  }
  return row;
};

// PUT /api/courses/student/sheets/:id/rows/:rowId  { data }
const learnerUpdateRow = async (req, res) => {
  try {
    const sheet = await loadLearnerSheet(req, res);
    if (!sheet) return;
    const row = await loadOwnRow(req, res, sheet);
    if (!row) return;
    const data = cleanRowData(sheet.columns, req.body?.data);
    if (!data) return res.status(400).json({ success: false, message: 'Fill in at least one cell, or delete the row.' });
    // Keep values of columns the admin has since removed from the template
    const updated = await prisma.sheetRow.update({
      where: { id: row.id },
      data: { data: { ...(row.data || {}), ...data } },
      select: { id: true, data: true, createdAt: true, updatedAt: true },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    fail(res, error, 'Failed to save the row.');
  }
};

// DELETE /api/courses/student/sheets/:id/rows/:rowId
const learnerDeleteRow = async (req, res) => {
  try {
    const sheet = await loadLearnerSheet(req, res);
    if (!sheet) return;
    const row = await loadOwnRow(req, res, sheet);
    if (!row) return;
    await prisma.sheetRow.delete({ where: { id: row.id } });
    res.json({ success: true, message: 'Row deleted.' });
  } catch (error) {
    fail(res, error, 'Failed to delete the row.');
  }
};

module.exports = {
  adminListSheets, adminCreateSheet, adminUpdateSheet, adminDeleteSheet, adminGetSheet, adminGetLearnerRows, adminExportSheet,
  learnerListSheets, learnerGetRows, learnerAddRow, learnerUpdateRow, learnerDeleteRow,
};
