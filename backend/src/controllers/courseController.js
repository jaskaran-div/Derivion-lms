const prisma = require('../config/database');
const { uploadToS3, generateS3Key, getCloudFrontUrl, deleteFromS3, isAwsConfigured, createMultipartUpload, getUploadPartUrl, completeMultipartUpload, abortMultipartUpload } = require('../config/aws');

// GET /api/courses - Public listing with search & filter
const getCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      categoryId,
      level,
      minPrice,
      maxPrice,
      isFree,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      status: 'PUBLISHED',
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(level && { level }),
      ...(isFree === 'true' && { isFree: true }),
      ...(minPrice || maxPrice
        ? {
            price: {
              ...(minPrice && { gte: parseFloat(minPrice) }),
              ...(maxPrice && { lte: parseFloat(maxPrice) }),
            },
          }
        : {}),
    };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { enrollments: true, sections: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        courses,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// GET /api/courses/:slug - Public course detail
const getCourseBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        category: true,
        sections: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            contents: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                duration: true,
                isFree: true,
                order: true,
                isPublished: true,
              },
            },
          },
        },
        _count: { select: { enrollments: true } },
        assessments: {
          where: { isPublished: true },
          select: { id: true, title: true, type: true, timeLimit: true },
        },
      },
    });

    if (!course || course.status !== 'PUBLISHED') {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    // Check if user is enrolled (Admin always has access)
    let isEnrolled = false;
    let completedContentIds = [];
    if (req.user) {
      if (req.user.role === 'ADMIN') {
        isEnrolled = true;
      } else {
        const enrollment = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: req.user.id, courseId: course.id } },
        });
        isEnrolled = !!enrollment;
      }

      // Fetch user's completed contents
      const progresses = await prisma.contentProgress.findMany({
        where: {
          userId: req.user.id,
          content: { section: { courseId: course.id } },
          isCompleted: true,
        },
        select: { contentId: true },
      });
      completedContentIds = progresses.map((p) => p.contentId);
    }

    // Dynamic lesson counts & durations
    const allContents = (course.sections || []).flatMap((s) => s.contents || []);
    const dynamicLessons = allContents.length;
    const dynamicDuration = allContents.reduce((acc, c) => acc + (c.duration || 0), 0);

    const sectionsWithProgress = (course.sections || []).map((section) => ({
      ...section,
      contents: (section.contents || []).map((c) => ({
        ...c,
        isCompleted: completedContentIds.includes(c.id),
      })),
    }));

    res.json({
      success: true,
      data: {
        ...course,
        sections: sectionsWithProgress,
        totalLessons: dynamicLessons || course.totalLessons,
        totalDuration: dynamicDuration || course.totalDuration,
        isEnrolled,
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
          include: { contents: { orderBy: { order: 'asc' } } },
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
