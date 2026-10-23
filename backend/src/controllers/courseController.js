const prisma = require('../config/database');
const cache = require('../config/cache');
const { uploadToS3, generateS3Key, getCloudFrontUrl, deleteFromS3, isAwsConfigured, createMultipartUpload, getUploadPartUrl, completeMultipartUpload, abortMultipartUpload } = require('../config/aws');

const SORTABLE = ['createdAt', 'title', 'price', 'totalStudents', 'updatedAt'];
const CATALOG_TTL = 120;

// GET /api/courses - Public listing with search & filter (cached per query)
const getCourses = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const { search, categoryId, level, minPrice, maxPrice, isFree } = req.query;
    const sortBy = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';

    const where = {
      status: 'PUBLISHED',
      ...(term && {
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { tags: { has: term } },
        ],
      }),
      ...(typeof categoryId === 'string' && categoryId && { categoryId }),
      ...(typeof level === 'string' && level && { level }),
      ...(isFree === 'true' && { isFree: true }),
      ...(minPrice || maxPrice
        ? {
            price: {
              ...(minPrice && !Number.isNaN(parseFloat(minPrice)) && { gte: parseFloat(minPrice) }),
              ...(maxPrice && !Number.isNaN(parseFloat(maxPrice)) && { lte: parseFloat(maxPrice) }),
            },
          }
        : {}),
    };

    const key = `courses:list:${JSON.stringify({ page, limit, term, categoryId, level, minPrice, maxPrice, isFree, sortBy, sortOrder })}`;
    const data = await cache.wrap(key, CATALOG_TTL, async () => {
      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            _count: { select: { enrollments: true, sections: true } },
          },
        }),
        prisma.course.count({ where }),
      ]);
      return { courses, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// Published course structure shared by every visitor (cached); learner-specific state is added per request
const loadPublicCourse = (slug) =>
  cache.wrap(`courses:detail:${slug}`, CATALOG_TTL, async () => {
    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        category: true,
        sections: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            contents: {
              where: { isPublished: true },
              orderBy: { order: 'asc' },
              select: { id: true, title: true, type: true, duration: true, isFree: true, order: true, isPublished: true, assessmentId: true },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course || course.status !== 'PUBLISHED') return null;
    const allContents = course.sections.flatMap((sec) => sec.contents);
    return {
      ...course,
      totalLessons: allContents.length || course.totalLessons,
      totalDuration: allContents.reduce((acc, c) => acc + (c.duration || 0), 0) || course.totalDuration,
    };
  });

// GET /api/courses/:slug - Public course detail
const getCourseBySlug = async (req, res) => {
  try {
    const course = await loadPublicCourse(req.params.slug);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    let isEnrolled = false;
    let isBookmarked = false;
    let completedContentIds = new Set();
    if (req.user) {
      const [enrollment, bookmark, progresses] = await Promise.all([
        req.user.role === 'ADMIN'
          ? Promise.resolve({ status: 'ACTIVE' })
          : prisma.enrollment.findUnique({ where: { userId_courseId: { userId: req.user.id, courseId: course.id } } }),
        prisma.courseBookmark.findUnique({ where: { userId_courseId: { userId: req.user.id, courseId: course.id } } }),
        prisma.contentProgress.findMany({
          where: { userId: req.user.id, isCompleted: true, content: { section: { courseId: course.id } } },
          select: { contentId: true },
        }),
      ]);
      isEnrolled = Boolean(enrollment) && ['ACTIVE', 'COMPLETED'].includes(enrollment.status);
      isBookmarked = Boolean(bookmark);
      completedContentIds = new Set(progresses.map((p) => p.contentId));
    }

    res.json({
      success: true,
      data: {
        ...course,
        sections: course.sections.map((section) => ({
          ...section,
          contents: section.contents.map((c) => ({ ...c, isCompleted: completedContentIds.has(c.id) })),
        })),
        isEnrolled,
        isBookmarked,
      },
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch course.' });
  }
};

// POST /api/admin/courses - Create course (Admin)
const createCourse = async (req, res) => {
  try {
    const {
      title, description, shortDesc, categoryId, price,
      discountPrice, isFree, emiEnabled, level, language, tags, requirements, objectives,
    } = req.body;

    if (emiEnabled !== undefined && typeof emiEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'EMI eligibility must be a Boolean.' });
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      + '-' + Date.now();

    const course = await prisma.course.create({
      data: {
        title, slug, description, shortDesc, categoryId,
        price: parseFloat(price) || 0,
        discountPrice: discountPrice ? parseFloat(discountPrice) : null,
        isFree: isFree === true || isFree === 'true',
        emiEnabled: emiEnabled === true,
        level: level || 'Beginner',
        language: language || 'English',
        tags: tags || [],
        requirements: requirements || [],
        objectives: objectives || [],
      },
    });

    res.status(201).json({ success: true, message: 'Course created.', data: course });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ success: false, message: 'Failed to create course.' });
  }
};

// PUT /api/admin/courses/:id - Update course (Admin)
const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (data.emiEnabled !== undefined && typeof data.emiEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'EMI eligibility must be a Boolean.' });
    }

    if (data.price) data.price = parseFloat(data.price);
    if (data.discountPrice) data.discountPrice = parseFloat(data.discountPrice);
    if (data.isFree !== undefined) data.isFree = data.isFree === true || data.isFree === 'true';

    const course = await prisma.course.update({
      where: { id },
      data,
    });

    res.json({ success: true, message: 'Course updated.', data: course });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ success: false, message: 'Failed to update course.' });
  }
};

// DELETE /api/admin/courses/:id - Delete course (Admin)
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.course.delete({ where: { id } });
    res.json({ success: true, message: 'Course deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Course not found.' });
    console.error('deleteCourse error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete course.' });
  }
};

// POST /api/admin/courses/:id/thumbnail - Upload thumbnail
const uploadThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const key = generateS3Key(`courses/${id}/thumbnails`, req.file.originalname);
    const { cloudFrontUrl } = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    await prisma.course.update({ where: { id }, data: { thumbnail: cloudFrontUrl } });

    res.json({ success: true, data: { thumbnail: cloudFrontUrl } });
  } catch (error) {
    console.error('Upload thumbnail error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload thumbnail.' });
  }
};

// POST /api/admin/courses/:id/preview-video - Upload course intro/promo video
const uploadPreviewVideo = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const key = generateS3Key(`courses/${id}/preview`, req.file.originalname);
    const { cloudFrontUrl } = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    await prisma.course.update({ where: { id }, data: { previewVideo: cloudFrontUrl } });

    res.json({ success: true, data: { previewVideo: cloudFrontUrl } });
  } catch (error) {
    console.error('Upload preview video error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload preview video.' });
  }
};

// POST /api/admin/courses/:id/publish - Toggle publish status
const togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    const newStatus = course.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const updated = await prisma.course.update({
      where: { id },
      data: { status: newStatus },
    });

    // When publishing a course, automatically publish all its sections and contents
    if (newStatus === 'PUBLISHED') {
      await prisma.section.updateMany({
        where: { courseId: id },
        data: { isPublished: true },
      });
      await prisma.content.updateMany({
        where: { section: { courseId: id } },
        data: { isPublished: true },
      });
    }

    res.json({ success: true, message: `Course ${newStatus.toLowerCase()}.`, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update course status.' });
  }
};

// Admin: GET /api/admin/courses - All courses
const adminGetCourses = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
      ...(status && { status }),
    };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { name: true } },
          _count: { select: { enrollments: true, sections: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    res.json({
      success: true,
      data: { courses, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// Admin: GET /api/admin/courses/:id - Single course with full detail
const adminGetCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        sections: {
          orderBy: { order: 'asc' },
          include: {
            contents: {
              orderBy: { order: 'asc' },
              include: { assessment: { select: { id: true, title: true, isPublished: true } } },
            },
          },
        },
        assessments: {
          include: { questions: { orderBy: { order: 'asc' } } },
        },
        _count: { select: { enrollments: true } },
      },
    });

    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch course.' });
  }
};

const PREVIEW_PART_SIZE = 8 * 1024 * 1024;

const initPreviewMultipart = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, contentType, fileSize } = req.body;
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    if (!isAwsConfigured()) {
      return res.json({ success: true, data: { mode: 'proxy' } });
    }
    const key = generateS3Key(`courses/${id}/preview`, fileName || 'preview.mp4');
    const uploadId = await createMultipartUpload(key, contentType || 'video/mp4');
    const size = parseInt(fileSize, 10) || 0;
    const partCount = Math.max(1, Math.ceil(size / PREVIEW_PART_SIZE));
    const partUrls = await Promise.all(
      Array.from({ length: partCount }, (_, i) => getUploadPartUrl(key, uploadId, i + 1))
    );
    res.json({
      success: true,
      data: { mode: 'direct', uploadId, key, partSize: PREVIEW_PART_SIZE, partUrls, cloudFrontUrl: getCloudFrontUrl(key) },
    });
  } catch (error) {
    console.error('Init preview multipart error:', error);
    res.json({ success: true, data: { mode: 'proxy' } });
  }
};

const completePreviewMultipart = async (req, res) => {
  try {
    const { id } = req.params;
    const { uploadId, key, parts } = req.body;
    const { cloudFrontUrl } = await completeMultipartUpload(
      key,
      uploadId,
      parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber }))
    );
    await prisma.course.update({ where: { id }, data: { previewVideo: cloudFrontUrl } });
    res.json({ success: true, data: { previewVideo: cloudFrontUrl } });
  } catch (error) {
    console.error('Complete preview multipart error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete preview upload.' });
  }
};

const abortPreviewMultipart = async (req, res) => {
  try {
    const { uploadId, key } = req.body;
    if (uploadId && key) await abortMultipartUpload(key, uploadId);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  getCourses, getCourseBySlug, createCourse, updateCourse, deleteCourse,
  uploadThumbnail, uploadPreviewVideo, togglePublish, adminGetCourses, adminGetCourse,
  initPreviewMultipart, completePreviewMultipart, abortPreviewMultipart,
};
