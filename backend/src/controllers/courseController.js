const prisma = require('../config/database');
const cache = require('../config/cache');
const { uploadToS3, generateS3Key, getCloudFrontUrl, getPublicMediaUrl, deleteFromS3, isAwsConfigured, createMultipartUpload, getUploadPartUrl, completeMultipartUpload, abortMultipartUpload } = require('../config/aws');

const { sendCSV, isoDate } = require('../utils/csv');
const { isPlaceholderEmail } = require('../utils/credentials');

const { hasAccess } = require('../services/progress');

// "YYYY-MM-DD" -> the end of that day, India time (null when invalid)
const endOfDayIST = (raw) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return null;
  const end = new Date(`${raw}T23:59:59.999+05:30`);
  return Number.isNaN(end.getTime()) ? null : end;
};

// Course access duration from the form: accessMonths (1-120, or null for lifetime) or a fixed
// accessEndDate ("YYYY-MM-DD", access ends at the end of that day). Returns { data } or { error }.
const parseAccessDuration = (body) => {
  const data = {};
  if (body.accessMonths !== undefined) {
    if (body.accessMonths === null || body.accessMonths === '' || Number(body.accessMonths) === 0) data.accessMonths = null;
    else {
      const m = parseInt(body.accessMonths, 10);
      if (!Number.isInteger(m) || m < 1 || m > 120) return { error: 'Access duration must be between 1 and 120 months.' };
      data.accessMonths = m;
    }
  }
  if (body.accessEndDate !== undefined) {
    if (body.accessEndDate === null || body.accessEndDate === '') data.accessEndDate = null;
    else {
      const end = endOfDayIST(body.accessEndDate);
      if (!end) return { error: 'Pick a valid access end date.' };
      if (end <= new Date()) return { error: 'The access end date must be in the future.' };
      data.accessEndDate = end;
    }
  }
  // One rule at a time: a fixed end date replaces a number of months and vice versa
  if (data.accessEndDate) data.accessMonths = null;
  else if (data.accessMonths) data.accessEndDate = null;
  return { data };
};

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
    let accessExpiresAt = null;
    let accessExpired = false;
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
      isEnrolled = hasAccess(enrollment);
      accessExpiresAt = enrollment?.expiresAt || null;
      // Bought before, but the access period is over: the page offers to buy again
      accessExpired = Boolean(enrollment) && enrollment.status !== 'REFUNDED' && !isEnrolled;
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
        accessExpiresAt,
        accessExpired,
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
    const access = parseAccessDuration(req.body);
    if (access.error) return res.status(400).json({ success: false, message: access.error });

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
        ...access.data,
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
    const body = req.body || {};

    if (body.emiEnabled !== undefined && typeof body.emiEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'EMI eligibility must be a Boolean.' });
    }

    // Only course details are editable here; slug, status and counters are managed elsewhere
    const data = {};
    const text = (v, max) => String(v ?? '').trim().slice(0, max);
    const list = (v) => (Array.isArray(v) ? v.map((x) => text(x, 300)).filter(Boolean).slice(0, 50) : undefined);
    const money = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };

    if (body.title !== undefined) {
      data.title = text(body.title, 200);
      if (data.title.length < 5) return res.status(400).json({ success: false, message: 'Title must be at least 5 characters.' });
    }
    if (body.description !== undefined) {
      data.description = text(body.description, 20000);
      if (data.description.length < 20) return res.status(400).json({ success: false, message: 'Description must be at least 20 characters.' });
    }
    if (body.shortDesc !== undefined) data.shortDesc = text(body.shortDesc, 500) || null;
    if (body.categoryId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: String(body.categoryId) }, select: { id: true } });
      if (!category) return res.status(400).json({ success: false, message: 'Select a valid category.' });
      data.categoryId = category.id;
    }
    if (body.level !== undefined) data.level = text(body.level, 50) || 'Beginner';
    if (body.language !== undefined) data.language = text(body.language, 50) || 'English';
    if (body.price !== undefined) {
      data.price = money(body.price);
      if (Number.isNaN(data.price)) return res.status(400).json({ success: false, message: 'Enter a valid price.' });
    }
    if (body.discountPrice !== undefined) {
      data.discountPrice = body.discountPrice === null || body.discountPrice === '' ? null : money(body.discountPrice);
      if (Number.isNaN(data.discountPrice)) return res.status(400).json({ success: false, message: 'Enter a valid discount price.' });
    }
    if (body.isFree !== undefined) data.isFree = body.isFree === true || body.isFree === 'true';
    if (body.emiEnabled !== undefined) data.emiEnabled = body.emiEnabled;
    if (body.tags !== undefined) data.tags = list(body.tags) || [];
    if (body.requirements !== undefined) data.requirements = list(body.requirements) || [];
    if (body.objectives !== undefined) data.objectives = list(body.objectives) || [];
    if (body.completionThreshold !== undefined) {
      const t = parseInt(body.completionThreshold, 10);
      if (!Number.isInteger(t) || t < 1 || t > 100) return res.status(400).json({ success: false, message: 'Completion threshold must be between 1 and 100.' });
      data.completionThreshold = t;
    }

    const access = parseAccessDuration(body);
    if (access.error) return res.status(400).json({ success: false, message: access.error });
    Object.assign(data, access.data);

    const price = data.price ?? undefined;
    if (data.discountPrice != null && price !== undefined && data.discountPrice > price) {
      return res.status(400).json({ success: false, message: 'Discount price cannot be higher than the price.' });
    }

    const course = await prisma.course.update({
      where: { id },
      data,
      include: { category: true },
    });

    res.json({ success: true, message: 'Course updated.', data: course });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Course not found.' });
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
    const { s3Key } = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    const url = getPublicMediaUrl(s3Key);

    await prisma.course.update({ where: { id }, data: { thumbnail: url } });

    res.json({ success: true, data: { thumbnail: url } });
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
    const { s3Key } = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    const url = getPublicMediaUrl(s3Key);

    await prisma.course.update({ where: { id }, data: { previewVideo: url } });

    res.json({ success: true, data: { previewVideo: url } });
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

// GET /api/courses/admin/:id/enrollments[?search=&format=csv]
// Everyone enrolled in a course: name, login ID, contact, progress and status
const adminGetCourseEnrollments = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id }, select: { id: true, slug: true } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    const search = String(req.query.search || '').trim().slice(0, 100);
    const userWhere = search
      ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }
      : undefined;

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: course.id, ...(userWhere && { user: userWhere }) },
      orderBy: { enrolledAt: 'desc' },
      take: 5000,
      select: {
        id: true, status: true, enrolledAt: true, completedAt: true, progressPercent: true, lastAccessedAt: true, expiresAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, username: true, phone: true, avatar: true, isActive: true } },
      },
    });

    const rows = enrollments.map((e) => ({
      enrollmentId: e.id,
      userId: e.user.id,
      name: `${e.user.firstName || ''} ${e.user.lastName || ''}`.trim(),
      email: isPlaceholderEmail(e.user.email) ? null : e.user.email,
      username: e.user.username,
      phone: e.user.phone,
      avatar: e.user.avatar,
      isActive: e.user.isActive,
      status: e.status,
      progressPercent: Number(e.progressPercent),
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
      lastAccessedAt: e.lastAccessedAt,
      expiresAt: e.expiresAt,
      accessExpired: Boolean(e.expiresAt) && new Date(e.expiresAt) <= new Date(),
    }));

    if (req.query.format === 'csv') {
      return sendCSV(res, `${course.slug}-learners.csv`,
        ['Name', 'Email', 'Username', 'Phone', 'Learner ID', 'Status', 'Progress %', 'Enrolled on', 'Access until', 'Completed on', 'Last active'],
        rows.map((r) => [r.name, r.email || '', r.username || '', r.phone || '', r.userId, r.accessExpired ? 'EXPIRED' : r.status, r.progressPercent,
          isoDate(r.enrolledAt), r.expiresAt ? isoDate(r.expiresAt) : 'Lifetime', isoDate(r.completedAt), isoDate(r.lastAccessedAt)]));
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Course enrollments error:', error);
    res.status(500).json({ success: false, message: 'Failed to load enrolled learners.' });
  }
};

// PUT /api/courses/admin/enrollments/:enrollmentId/access  { expiresAt: "YYYY-MM-DD" | null }
// Admin sets one learner's access end date (null = lifetime), e.g. to extend or end access
const adminSetEnrollmentAccess = async (req, res) => {
  try {
    const raw = req.body?.expiresAt;
    let expiresAt = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      expiresAt = endOfDayIST(raw);
      if (!expiresAt) return res.status(400).json({ success: false, message: 'Pick a valid date.' });
    }
    const enrollment = await prisma.enrollment.update({
      where: { id: req.params.enrollmentId },
      data: { expiresAt },
      select: { id: true, expiresAt: true },
    });
    res.json({ success: true, data: enrollment });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Enrollment not found.' });
    console.error('Set enrollment access error:', error);
    res.status(500).json({ success: false, message: 'Failed to update access.' });
  }
};

module.exports = {
  getCourses, getCourseBySlug, createCourse, updateCourse, deleteCourse,
  uploadThumbnail, uploadPreviewVideo, togglePublish, adminGetCourses, adminGetCourse,
  initPreviewMultipart, completePreviewMultipart, abortPreviewMultipart,
  adminGetCourseEnrollments, adminSetEnrollmentAccess,
};
