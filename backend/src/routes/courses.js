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
  previewImport, bulkAddQuestions,
  getAssessment, startAttempt, saveProgress, submitAttempt,
} = require('../controllers/assessmentController');
const prisma = require('../config/database');

// ==================== PUBLIC ROUTES ====================
router.get('/', optionalAuth, getCourses);
router.get('/:slug', optionalAuth, getCourseBySlug);
router.post('/content/:id/duration', syncContentDuration);

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
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  res.json({ success: true, data: categories });
});
router.post('/categories', ...adminAuth, async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const cat = await prisma.category.create({ data: { name, slug, description, icon } });
    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
});
router.put('/categories/:id', ...adminAuth, async (req, res) => {
  try {
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: cat });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update category.' });
  }
});
router.delete('/categories/:id', ...adminAuth, async (req, res) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Category deleted.' });
  } catch {
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

