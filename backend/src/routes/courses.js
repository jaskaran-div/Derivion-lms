const express = require('express');
const router = express.Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { imageUpload, videoUpload, documentUpload, quizDocUpload } = require('../middleware/upload');
const {
  getCourses, getCourseBySlug, createCourse, updateCourse, deleteCourse,
  uploadThumbnail, uploadPreviewVideo, togglePublish, adminGetCourses, adminGetCourse,
  initPreviewMultipart, completePreviewMultipart, abortPreviewMultipart,
} = require('../controllers/courseController');
const {
  createSection, updateSection, deleteSection, reorderSections,
  createContent, uploadContent, getPresignedUrl, updateContent, deleteContent,
  getContentForStudent, updateProgress, syncContentDuration,
  initContentMultipart, completeContentMultipart, abortContentMultipart,
} = require('../controllers/contentController');
const {
  listQuizzes, getQuizAdmin, createQuiz, updateQuiz, deleteQuiz,
  addQuestion, updateQuestion, deleteQuestion, listQuizAttempts,
  previewImport, bulkAddQuestions, getQuizAnalytics,
  getAssessment, startAttempt, saveProgress, submitAttempt,
} = require('../controllers/assessmentController');
const prisma = require('../config/database');
const { renderCertificatePdf } = require('../services/certificatePdf');
const { getPublicSettings } = require('../services/settings');
const cache = require('../config/cache');

// ==================== PUBLIC ROUTES ====================
// Any successful admin write to courses, sections, lessons or categories clears the public catalog cache
router.use((req, res, next) => {
  if (req.method !== 'GET' && (req.path.startsWith('/admin') || req.path.startsWith('/categories'))) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        cache.delPrefix('courses:');
        cache.del('categories:all');
      }
    });
  }
  next();
});

// "Allow guest browsing" off → the catalog requires a login
const guestBrowsingGate = async (req, res, next) => {
  if (req.user) return next();
  try {
    const { allowGuestBrowsing } = await getPublicSettings();
    if (!allowGuestBrowsing) return res.status(401).json({ success: false, code: 'LOGIN_REQUIRED', message: 'Please log in to browse courses.' });
  } catch { /* default to open */ }
  next();
};

router.get('/', optionalAuth, guestBrowsingGate, getCourses);
router.get('/:slug', optionalAuth, guestBrowsingGate, getCourseBySlug);
// Only staff may change lesson durations (players report length while previewing)
router.post('/content/:id/duration', authenticate, authorize('ADMIN', 'TEACHER'), syncContentDuration);

// ==================== ADMIN ROUTES ====================
const adminAuth = [authenticate, authorize('ADMIN')];

// Course CRUD
// Quiz bank (admin) — must stay above the /admin/:id course routes
router.get('/admin/quizzes', ...adminAuth, listQuizzes);
router.post('/admin/quizzes', ...adminAuth, createQuiz);
router.get('/admin/quizzes/:id', ...adminAuth, getQuizAdmin);
router.put('/admin/quizzes/:id', ...adminAuth, updateQuiz);
router.delete('/admin/quizzes/:id', ...adminAuth, deleteQuiz);
router.get('/admin/quizzes/:id/attempts', ...adminAuth, listQuizAttempts);
router.get('/admin/quizzes/:id/analytics', ...adminAuth, getQuizAnalytics);
router.post('/admin/quizzes/:id/questions', ...adminAuth, addQuestion);
router.post('/admin/quizzes/:id/questions/bulk', ...adminAuth, bulkAddQuestions);
router.post('/admin/quizzes/:id/import/preview', ...adminAuth, (req, res, next) => {
  quizDocUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, previewImport);
router.put('/admin/questions/:id', ...adminAuth, updateQuestion);
router.delete('/admin/questions/:id', ...adminAuth, deleteQuestion);

router.get('/admin/all', ...adminAuth, adminGetCourses);
router.get('/admin/:id', ...adminAuth, adminGetCourse);
router.post('/admin', ...adminAuth, createCourse);
router.put('/admin/:id', ...adminAuth, updateCourse);
router.delete('/admin/:id', ...adminAuth, deleteCourse);
router.post('/admin/:id/thumbnail', ...adminAuth, imageUpload.single('thumbnail'), uploadThumbnail);
router.post('/admin/:id/preview-video', ...adminAuth, videoUpload.single('video'), uploadPreviewVideo);
router.post('/admin/:id/preview-video/multipart/init', ...adminAuth, initPreviewMultipart);
router.post('/admin/:id/preview-video/multipart/complete', ...adminAuth, completePreviewMultipart);
router.post('/admin/:id/preview-video/multipart/abort', ...adminAuth, abortPreviewMultipart);
router.post('/admin/:id/publish', ...adminAuth, togglePublish);

// Sections
router.post('/admin/:courseId/sections', ...adminAuth, createSection);
router.put('/admin/sections/:id', ...adminAuth, updateSection);
router.delete('/admin/sections/:id', ...adminAuth, deleteSection);
router.put('/admin/:courseId/sections/reorder', ...adminAuth, reorderSections);

// Contents
router.post('/admin/sections/:sectionId/contents', ...adminAuth, createContent);
router.put('/admin/contents/:id', ...adminAuth, updateContent);
router.delete('/admin/contents/:id', ...adminAuth, deleteContent);
router.post('/admin/contents/:id/upload-video', ...adminAuth, videoUpload.single('video'), uploadContent);
router.post('/admin/contents/:id/upload-doc', ...adminAuth, documentUpload.single('document'), uploadContent);
router.get('/admin/contents/:id/presigned-url', ...adminAuth, getPresignedUrl);
router.post('/admin/contents/:id/multipart/init', ...adminAuth, initContentMultipart);
router.post('/admin/contents/:id/multipart/complete', ...adminAuth, completeContentMultipart);
router.post('/admin/contents/:id/multipart/abort', ...adminAuth, abortContentMultipart);

// Categories
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await cache.wrap('categories:all', 600, () =>
      prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
    res.json({ success: true, data: categories });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
});
// Admin list: every category (active or not) with how many courses use it
router.get('/categories/admin', ...adminAuth, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    res.json({ success: true, data: categories });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
});

const categorySlug = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

// Only these fields may be set from the form
const categoryInput = (body) => {
  const data = {};
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 100);
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim().slice(0, 500) : null;
  if (body.icon !== undefined) data.icon = body.icon ? String(body.icon).trim().slice(0, 16) : null;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  return data;
};

const categoryConflict = (res) => res.status(409).json({ success: false, message: 'A category with this name already exists.' });

router.post('/categories', ...adminAuth, async (req, res) => {
  try {
    const data = categoryInput(req.body || {});
    if (!data.name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const cat = await prisma.category.create({ data: { ...data, slug: categorySlug(data.name) } });
    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    if (error.code === 'P2002') return categoryConflict(res);
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
});
router.put('/categories/:id', ...adminAuth, async (req, res) => {
  try {
    const data = categoryInput(req.body || {});
    if (data.name === '') return res.status(400).json({ success: false, message: 'Category name is required.' });
    if (data.name) data.slug = categorySlug(data.name);
    const cat = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: cat });
  } catch (error) {
    if (error.code === 'P2002') return categoryConflict(res);
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Category not found.' });
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category.' });
  }
});
router.delete('/categories/:id', ...adminAuth, async (req, res) => {
  try {
    const courses = await prisma.course.count({ where: { categoryId: req.params.id } });
    if (courses) {
      return res.status(409).json({ success: false, message: `This category has ${courses} course(s). Move them to another category first.` });
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Category deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Category not found.' });
    res.status(500).json({ success: false, message: 'Failed to delete category.' });
  }
});

// ==================== STUDENT ROUTES ====================
const studentAuth = [authenticate, authorize('STUDENT', 'ADMIN')];

router.get('/student/content/:id', ...studentAuth, getContentForStudent);
router.post('/student/content/:id/progress', ...studentAuth, updateProgress);

// Assessments (student)
router.get('/student/assessments/:id', ...studentAuth, getAssessment);
router.post('/student/assessments/:id/start', ...studentAuth, startAttempt);
router.put('/student/attempts/:attemptId', ...studentAuth, saveProgress);
router.post('/student/attempts/:attemptId/submit', ...studentAuth, submitAttempt);

// ==================== PUBLIC CERTIFICATE VERIFICATION ====================
// Certificate PDF, rendered on demand. Uses the unguessable public certificate ID.
router.get('/verify/:certificateId/pdf', async (req, res) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { certificateId: req.params.certificateId },
      include: { user: { select: { firstName: true, lastName: true } }, course: { select: { title: true } } },
    });
    if (!cert) return res.status(404).json({ success: false, message: 'Certificate not found.' });
    const { siteName } = await getPublicSettings();
    const client = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="certificate-${cert.certificateNo}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    renderCertificatePdf(cert, res, { siteName, verifyUrl: `${client}/verify/${cert.certificateId}` });
  } catch (error) {
    console.error('Certificate PDF error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate certificate.' });
  }
});

router.get('/verify/:certificateId', async (req, res) => {
  try {
    const cert = await prisma.certificate.findFirst({
      where: {
        OR: [
          { certificateId: req.params.certificateId },
          { certificateNo: req.params.certificateId },
        ],
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        course: { select: { title: true, level: true } },
      },
    });

    if (!cert) {
      return res.status(404).json({ success: false, message: 'Certificate not found or invalid.' });
    }

    res.json({
      success: true,
      data: {
        certificateNo: cert.certificateNo,
        certificateId: cert.certificateId,
        recipientName: `${cert.user.firstName} ${cert.user.lastName}`,
        courseTitle: cert.course.title,
        courseLevel: cert.course.level,
        issuedAt: cert.issuedAt,
        isValid: true,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

module.exports = router;

