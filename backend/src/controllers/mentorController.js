const prisma = require('../config/database');
const { notifyUsers } = require('../services/notify');

const getStatus = (s, now = new Date()) => {
  if (now < s.startTime) return 'UPCOMING';
  if (now > s.endTime) return 'PAST';
  return 'LIVE';
};

const withStatus = (s) => ({ ...s, status: getStatus(s) });

const parseBody = (body) => {
  const { title, description, mentorName, courseId, startTime, endTime, meetingLink, recordingUrl, resources } = body;
  const data = {};
  if (title !== undefined) data.title = String(title).trim();
  if (description !== undefined) data.description = description || null;
  if (mentorName !== undefined) data.mentorName = String(mentorName).trim();
  if (courseId !== undefined) data.courseId = courseId || null;
  if (startTime !== undefined) data.startTime = new Date(startTime);
  if (endTime !== undefined) data.endTime = new Date(endTime);
  if (meetingLink !== undefined) data.meetingLink = meetingLink || null;
  if (recordingUrl !== undefined) data.recordingUrl = recordingUrl || null;
  if (resources !== undefined) data.resources = resources || null;
  return data;
};

const validate = (data, partial) => {
  if ((!partial || data.title !== undefined) && !data.title) return 'Title is required.';
  if ((!partial || data.mentorName !== undefined) && !data.mentorName) return 'Mentor name is required.';
  if ((!partial || data.courseId !== undefined) && !data.courseId) return 'Course is required.';
  if ((!partial || data.startTime !== undefined) && (!data.startTime || isNaN(data.startTime))) return 'Valid start time is required.';
  if ((!partial || data.endTime !== undefined) && (!data.endTime || isNaN(data.endTime))) return 'Valid end time is required.';
  return null;
};

const courseSelect = { course: { select: { id: true, title: true } } };

// Courses whose sessions this user may see: admin = all, student = own enrollments,
// teacher = courses their students are enrolled in
const visibleCourseFilter = async (user) => {
  if (user.role === 'ADMIN') return {};
  const where = user.role === 'TEACHER'
    ? { user: { createdById: user.id }, status: { not: 'REFUNDED' } }
    : { userId: user.id, status: { not: 'REFUNDED' } };
  const enrollments = await prisma.enrollment.findMany({ where, select: { courseId: true }, distinct: ['courseId'] });
  return { courseId: { in: enrollments.map((e) => e.courseId) } };
};

const notifyEnrolled = async (session) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: session.courseId, status: { not: 'REFUNDED' } },
    select: { userId: true },
  });
  if (enrollments.length === 0) return;
  const when = session.startTime.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  // Also emailed, so learners (and guardians) see the date in their inbox
  await notifyUsers(enrollments.map((e) => e.userId), {
    title: `New mentor session: ${session.title}`,
    message: `${session.mentorName} is hosting a live session for ${session.course.title} on ${when}.`,
    type: 'INFO',
    link: '/mentors',
  }, { email: true });
};

// GET /mentor-sessions — grouped into live / upcoming / past, scoped to the user's courses
const listSessions = async (req, res) => {
  try {
    const where = await visibleCourseFilter(req.user);
    const sessions = await prisma.mentorSession.findMany({ where, include: courseSelect, orderBy: { startTime: 'asc' } });
    const now = new Date();
    const grouped = { live: [], upcoming: [], past: [] };
    for (const s of sessions) {
      const status = getStatus(s, now);
      grouped[status.toLowerCase()].push({ ...s, status });
    }
    grouped.past.reverse(); // most recent first
    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('listSessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch mentor sessions.' });
  }
};

const createSession = async (req, res) => {
  try {
    const data = parseBody(req.body);
    const err = validate(data, false);
    if (err) return res.status(400).json({ success: false, message: err });
    if (data.endTime <= data.startTime) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }
    const course = await prisma.course.findUnique({ where: { id: data.courseId }, select: { id: true } });
    if (!course) return res.status(400).json({ success: false, message: 'Course not found.' });
    const session = await prisma.mentorSession.create({
      data: { ...data, createdById: req.user.id },
      include: courseSelect,
    });
    try {
      await notifyEnrolled(session);
    } catch (e) {
      console.error('mentor session notify error:', e);
    }
    res.status(201).json({ success: true, data: withStatus(session) });
  } catch (error) {
    console.error('createSession error:', error);
    res.status(500).json({ success: false, message: 'Failed to create mentor session.' });
  }
};

const updateSession = async (req, res) => {
  try {
    const existing = await prisma.mentorSession.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Session not found.' });
    const data = parseBody(req.body);
    const err = validate(data, true);
    if (err) return res.status(400).json({ success: false, message: err });
    const start = data.startTime || existing.startTime;
    const end = data.endTime || existing.endTime;
    if (end <= start) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }
    const session = await prisma.mentorSession.update({ where: { id: req.params.id }, data, include: courseSelect });
    res.json({ success: true, data: withStatus(session) });
  } catch (error) {
    console.error('updateSession error:', error);
    res.status(500).json({ success: false, message: 'Failed to update mentor session.' });
  }
};

const deleteSession = async (req, res) => {
  try {
    await prisma.mentorSession.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Session deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Session not found.' });
    console.error('deleteSession error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete mentor session.' });
  }
};

module.exports = { listSessions, createSession, updateSession, deleteSession };
