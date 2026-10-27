const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { generateUsername, generatePassword, studentEmail } = require('../utils/credentials');
const { teacherSchoolId } = require('../services/learners');
const { logAudit } = require('./auditController');

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a CSV text body into an array of row objects.
 * Supports: firstName, lastName, guardianEmail, guardianPhone, courseIds (pipe-separated)
 */
const parseCSV = (text) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Naive CSV split (handles basic cases — no embedded commas in quoted fields)
    const values = line.split(',').map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push({ _line: i + 1, ...row });
  }

  return rows;
};

const validateRow = (row, index) => {
  const errors = [];
  if (!row.firstname && !row.first_name) errors.push('firstName is required');
  if (!row.lastname && !row.last_name) errors.push('lastName is required');
  if (!row.guardianemail && !row.guardian_email && !row.guardianphone && !row.guardian_phone) {
    errors.push('guardianEmail or guardianPhone is required');
  }
  return errors;
};

const normalizeRow = (row) => ({
  firstName: (row.firstname || row.first_name || '').trim(),
  lastName: (row.lastname || row.last_name || '').trim(),
  guardianEmail: (row.guardianemail || row.guardian_email || '').trim() || null,
  guardianPhone: (row.guardianphone || row.guardian_phone || row.phone || '').trim() || null,
  courseIds: (row.courseids || row.course_ids || row.courses || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean),
});

// ── GET CSV template ─────────────────────────────────────────────────────────

// GET /api/teacher/students/import/template
const getImportTemplate = (req, res) => {
  const csv = [
    'firstName,lastName,guardianEmail,guardianPhone,courseIds',
    'John,Doe,parent@example.com,9876543210,',
    'Jane,Smith,,9812345678,course-id-1|course-id-2',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.csv"');
  res.send(csv);
};

// ── POST /api/teacher/students/import  (validate only — dry run) ─────────────

// POST /api/teacher/students/import/validate
const validateImport = async (req, res) => {
  try {
    const text = req.body?.csvData || '';
    if (!text) return res.status(400).json({ success: false, message: 'csvData is required.' });

    const rows = parseCSV(text);
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'CSV has no data rows.' });
    }

    const results = [];
    const seenEmails = new Set();

    for (const row of rows) {
      const errors = validateRow(row, row._line);
      const norm = normalizeRow(row);

      // Check for duplicate within the file
      const key = `${norm.firstName}|${norm.lastName}|${norm.guardianEmail}`;
      if (seenEmails.has(key)) errors.push('Duplicate row in this file');
      seenEmails.add(key);

      results.push({
        line: row._line,
        data: norm,
        status: errors.length ? 'invalid' : 'valid',
        errors,
      });
    }

    const validCount = results.filter((r) => r.status === 'valid').length;
    const invalidCount = results.filter((r) => r.status === 'invalid').length;

    res.json({
      success: true,
      data: {
        totalRows: rows.length,
        validCount,
        invalidCount,
        results,
      },
    });
  } catch (error) {
    console.error('Import validate error:', error);
    res.status(500).json({ success: false, message: 'Validation failed.' });
  }
};

// ── POST /api/teacher/students/import  (actual import) ───────────────────────

// POST /api/teacher/students/import
const importStudents = async (req, res) => {
  try {
    const { csvData, classId, courseIds: defaultCourseIds = [] } = req.body;
    const teacherId = req.user.id;
    // Teachers' imports go to their own school when none is picked
    const schoolId = req.body.schoolId || (req.user.role === 'TEACHER' ? await teacherSchoolId(teacherId) : null);

    if (!csvData) {
      return res.status(400).json({ success: false, message: 'csvData is required.' });
    }

    const rows = parseCSV(csvData);
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'CSV has no data rows.' });
    }

    if (schoolId) {
      const schoolExists = await prisma.school.findUnique({ where: { id: schoolId } });
      if (!schoolExists) return res.status(400).json({ success: false, message: 'Specified school does not exist.' });
    }

    if (classId) {
      const classExists = await prisma.class.findUnique({ where: { id: classId } });
      if (!classExists) return res.status(400).json({ success: false, message: 'Specified class does not exist.' });
    }

    // Create the import job record
    const job = await prisma.studentImportJob.create({
      data: {
        schoolId: schoolId || null,
        createdById: teacherId,
        status: 'PROCESSING',
        totalRows: rows.length,
      },
    });

    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const errors = validateRow(row, row._line);
      const norm = normalizeRow(row);

      if (errors.length) {
        results.push({ line: row._line, status: 'failed', reason: errors.join('; '), data: norm });
        failedCount++;
        continue;
      }

      try {
        // Check for an existing student created by this teacher with same guardian contact
        if (norm.guardianEmail || norm.guardianPhone) {
          const contactFilters = [];
          if (norm.guardianEmail) contactFilters.push({ guardianEmail: norm.guardianEmail });
          if (norm.guardianPhone) contactFilters.push({ guardianPhone: norm.guardianPhone });

          const existingUser = await prisma.user.findFirst({
            where: {
              firstName: { equals: norm.firstName, mode: 'insensitive' },
              lastName: { equals: norm.lastName, mode: 'insensitive' },
              createdById: teacherId,
              OR: contactFilters,
            },
          });

          if (existingUser) {
            results.push({
              line: row._line,
              status: 'skipped',
              reason: 'Student already exists (duplicate guardian contact + name)',
              data: norm,
              studentId: existingUser.username,
            });
            skippedCount++;
            continue;
          }
        }

        const username = await generateUsername(norm.firstName, norm.lastName);
        const plainPassword = generatePassword(norm.firstName, norm.lastName);
        const hashedPassword = await bcrypt.hash(plainPassword, 12);
        const email = studentEmail(username);

        const student = await prisma.user.create({
          data: {
            email,
            username,
            password: hashedPassword,
            firstName: norm.firstName,
            lastName: norm.lastName,
            guardianEmail: norm.guardianEmail,
            guardianPhone: norm.guardianPhone,
            phone: norm.guardianPhone,
            role: 'STUDENT',
            createdById: teacherId,
            schoolId: schoolId || null,
            mustChangePassword: false, // students use the given temporary credentials
          },
        });

        // Enroll in courses — merge default with row-specific
        const allCourseIds = [...new Set([...defaultCourseIds, ...norm.courseIds])];
        const enrolledCourses = [];
        for (const courseId of allCourseIds) {
          try {
            await prisma.enrollment.create({ data: { userId: student.id, courseId } });
            await prisma.course.update({
              where: { id: courseId },
              data: { totalStudents: { increment: 1 } },
            });
            enrolledCourses.push(courseId);
          } catch {
            // skip invalid or duplicate enrollments
          }
        }

        // Add to school membership
        if (schoolId) {
          await prisma.schoolMembership.upsert({
            where: { schoolId_userId: { schoolId, userId: student.id } },
            create: { schoolId, userId: student.id, role: 'STUDENT' },
            update: {},
          });
        }

        // Add to class batch
        if (classId) {
          await prisma.studentBatch.upsert({
            where: { classId_studentId: { classId, studentId: student.id } },
            create: { classId, studentId: student.id },
            update: {},
          });
        }

        results.push({
          line: row._line,
          status: 'success',
          data: norm,
          studentId: username,
          password: plainPassword,
          enrolledCourses,
        });
        successCount++;
      } catch (err) {
        console.error(`Import row ${row._line} error:`, err);
        results.push({ line: row._line, status: 'failed', reason: 'Internal error', data: norm });
        failedCount++;
      }
    }

    // Sanitize results for DB storage: Never persist plaintext passwords in database!
    const sanitizedResults = results.map((r) => ({
      ...r,
      ...(r.password ? { password: '********' } : {}),
    }));

    // Update the job
    await prisma.studentImportJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        successCount,
        failedCount,
        skippedCount,
        results: sanitizedResults,
        completedAt: new Date(),
      },
    });

    await logAudit({
      userId: teacherId,
      action: 'BULK_IMPORT',
      targetId: job.id,
      targetType: 'studentImportJob',
      details: { totalRows: rows.length, successCount, failedCount, skippedCount },
      req,
    });

    res.json({
      success: true,
      message: `Import complete: ${successCount} created, ${skippedCount} skipped, ${failedCount} failed.`,
      data: {
        jobId: job.id,
        totalRows: rows.length,
        successCount,
        failedCount,
        skippedCount,
        results,
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Import failed.' });
  }
};

// GET /api/teacher/students/import/jobs — list past import jobs
const listImportJobs = async (req, res) => {
  try {
    const jobs = await prisma.studentImportJob.findMany({
      where: { createdById: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        totalRows: true,
        successCount: true,
        failedCount: true,
        skippedCount: true,
        fileName: true,
        createdAt: true,
        completedAt: true,
      },
    });
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch import jobs.' });
  }
};

// GET /api/teacher/students/import/jobs/:id — get job results
const getImportJob = async (req, res) => {
  try {
    const job = await prisma.studentImportJob.findUnique({
      where: { id: req.params.id },
    });

    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    // Only the creator (or admin) can view
    if (job.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch import job.' });
  }
};

module.exports = {
  getImportTemplate,
  validateImport,
  importStudents,
  listImportJobs,
  getImportJob,
};
