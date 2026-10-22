const prisma = require('../config/database');
const {
  uploadToS3, generateS3Key, deleteFromS3, getPresignedUploadUrl, getPresignedDownloadUrl,
  isAwsConfigured, createMultipartUpload, getUploadPartUrl, completeMultipartUpload, abortMultipartUpload,
  getCloudFrontUrl,
} = require('../config/aws');

const PART_SIZE = 8 * 1024 * 1024;

// POST /api/admin/courses/:courseId/sections
const createSection = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description } = req.body;

    const lastSection = await prisma.section.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
    });

    const section = await prisma.section.create({
      data: {
        title,
        description,
        courseId,
        isPublished: true,
        order: (lastSection?.order ?? -1) + 1,
      },
      include: { contents: true },
    });

    res.status(201).json({ success: true, data: section });
  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({ success: false, message: 'Failed to create section.' });
  }
};

// PUT /api/admin/sections/:id
const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isPublished } = req.body;

    const section = await prisma.section.update({
      where: { id },
      data: { title, description, isPublished },
    });

    res.json({ success: true, data: section });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update section.' });
  }
};

// DELETE /api/admin/sections/:id
const deleteSection = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await prisma.section.findUnique({
      where: { id },
      select: { courseId: true },
    });
    await prisma.section.delete({ where: { id } });
    if (section?.courseId) {
      await updateCourseStats(section.courseId);
    }
    res.json({ success: true, message: 'Section deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete section.' });
  }
};

// PUT /api/admin/courses/:courseId/sections/reorder
const reorderSections = async (req, res) => {
  try {
    const { sections } = req.body; // Array of { id, order }
    await Promise.all(
      sections.map(({ id, order }) =>
        prisma.section.update({ where: { id }, data: { order } })
      )
    );
    res.json({ success: true, message: 'Sections reordered.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reorder sections.' });
  }
};

const updateCourseStats = async (courseId) => {
  if (!courseId) return;
  try {
    const contents = await prisma.content.findMany({
      where: { section: { courseId } },
      select: { duration: true },
    });
    const totalLessons = contents.length;
    const totalDuration = contents.reduce((acc, c) => acc + (c.duration || 0), 0);
    await prisma.course.update({
      where: { id: courseId },
      data: { totalLessons, totalDuration },
    });
  } catch (err) {
    console.error('Error updating course stats:', err);
  }
};

// POST /api/admin/sections/:sectionId/contents
const createContent = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { title, type, description, externalUrl, isFree, assessmentId } = req.body;

    if (type === 'QUIZ') {
      if (!assessmentId) return res.status(400).json({ success: false, message: 'Select a quiz.' });
      const quiz = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true } });
      if (!quiz) return res.status(400).json({ success: false, message: 'Quiz not found.' });
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { courseId: true },
    });

    const lastContent = await prisma.content.findFirst({
      where: { sectionId },
      orderBy: { order: 'desc' },
    });

    const content = await prisma.content.create({
      data: {
        title,
        type,
        description,
        externalUrl,
        assessmentId: type === 'QUIZ' ? assessmentId : null,
        isFree: isFree === true || isFree === 'true',
        isPublished: true,
        sectionId,
        order: (lastContent?.order ?? -1) + 1,
      },
    });

    if (section?.courseId) {
      await updateCourseStats(section.courseId);
    }

    res.status(201).json({ success: true, data: content });
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({ success: false, message: 'Failed to create content.' });
  }
};

// POST /api/admin/contents/:id/upload - Upload file (video/doc) to S3
const uploadContent = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) return res.status(404).json({ success: false, message: 'Content not found.' });

    // Delete old file if exists
    if (content.s3Key) {
      await deleteFromS3(content.s3Key).catch(console.error);
    }

    const folder = content.type === 'VIDEO' ? 'videos' : 'documents';
    const key = generateS3Key(`courses/${folder}`, req.file.originalname);
    const { cloudFrontUrl, s3Key } = await uploadToS3(req.file.buffer, key, req.file.mimetype);

    // Verify content record still exists after file upload completes
    const contentCheck = await prisma.content.findUnique({ where: { id } });
    if (!contentCheck) {
      console.warn(`[Upload] Lesson with ID ${id} was deleted during the upload.`);
      await deleteFromS3(s3Key).catch(console.error);
      return res.status(404).json({
        success: false,
        message: 'The lesson was deleted before the upload finished. Please add the lesson again and re-upload.',
      });
    }

    let updated;
    try {
      updated = await prisma.content.update({
        where: { id },
        data: {
          s3Key,
          cloudFrontUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          isPublished: true,
        },
      });
    } catch (updateErr) {
      if (updateErr.code === 'P2025') {
        await deleteFromS3(s3Key).catch(console.error);
        return res.status(404).json({
          success: false,
          message: 'The lesson record was removed during the upload.',
        });
      }
      throw updateErr;
    }

    // Update course total duration for videos
    if (content.type === 'VIDEO' && req.body.duration) {
      const duration = parseInt(req.body.duration);
      await prisma.content.update({ where: { id }, data: { duration } });

      // Recalculate course total duration
      const sectionWithCourse = await prisma.section.findUnique({
        where: { id: content.sectionId },
        select: { courseId: true },
      });
      if (sectionWithCourse) {
        const totalDuration = await prisma.content.aggregate({
          where: {
            section: { courseId: sectionWithCourse.courseId },
            type: 'VIDEO',
          },
          _sum: { duration: true },
        });
        await prisma.course.update({
          where: { id: sectionWithCourse.courseId },
          data: { totalDuration: totalDuration._sum.duration || 0 },
        });
      }
    }

    res.json({ success: true, data: { ...updated, cloudFrontUrl } });
  } catch (error) {
    console.error('Upload content error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload content.' });
  }
};

// GET /api/admin/contents/:id/presigned-url - For direct client-to-S3 upload
const getPresignedUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { contentType, fileName } = req.query;

    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) return res.status(404).json({ success: false, message: 'Content not found.' });

    const folder = content.type === 'VIDEO' ? 'videos' : 'documents';
    const key = generateS3Key(`courses/${folder}`, fileName || 'file');
    const presignedUrl = await getPresignedUploadUrl(key, contentType);

    res.json({
      success: true,
      data: { presignedUrl, key, cloudFrontUrl: getCloudFrontUrl(key) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate presigned URL.' });
  }
};

const persistContentFile = async (id, { s3Key, cloudFrontUrl, fileSize, mimeType, duration }) => {
  const content = await prisma.content.findUnique({ where: { id } });
  if (!content) {
    await deleteFromS3(s3Key).catch(() => {});
    return null;
  }
  if (content.s3Key && content.s3Key !== s3Key) {
    await deleteFromS3(content.s3Key).catch(() => {});
  }

  const updated = await prisma.content.update({
    where: { id },
    data: {
      s3Key,
      cloudFrontUrl,
      fileSize: fileSize ? parseInt(fileSize, 10) : undefined,
      mimeType,
      isPublished: true,
      ...(duration ? { duration: parseInt(duration, 10) } : {}),
    },
  });

  if (content.type === 'VIDEO') {
    const sectionWithCourse = await prisma.section.findUnique({
      where: { id: content.sectionId },
      select: { courseId: true },
    });
    if (sectionWithCourse) {
      await updateCourseStats(sectionWithCourse.courseId);
    }
  }
  return updated;
};

const initContentMultipart = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, contentType, fileSize } = req.body;
    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) return res.status(404).json({ success: false, message: 'Content not found.' });

    if (!isAwsConfigured()) {
      return res.json({ success: true, data: { mode: 'proxy' } });
    }

    const folder = content.type === 'VIDEO' ? 'videos' : 'documents';
    const key = generateS3Key(`courses/${folder}`, fileName || 'file');
    const uploadId = await createMultipartUpload(key, contentType || 'application/octet-stream');
    const size = parseInt(fileSize, 10) || 0;
    const partCount = Math.max(1, Math.ceil(size / PART_SIZE));
    const partUrls = await Promise.all(
      Array.from({ length: partCount }, (_, i) => getUploadPartUrl(key, uploadId, i + 1))
    );

    res.json({
      success: true,
      data: {
        mode: 'direct',
        uploadId,
        key,
        partSize: PART_SIZE,
        partUrls,
        cloudFrontUrl: getCloudFrontUrl(key),
      },
    });
  } catch (error) {
    console.error('Init multipart error:', error);
    res.json({ success: true, data: { mode: 'proxy' } });
  }
};

const completeContentMultipart = async (req, res) => {
  try {
    const { id } = req.params;
    const { uploadId, key, parts, fileSize, mimeType, duration } = req.body;
    if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing multipart completion data.' });
    }

    const { cloudFrontUrl, s3Key } = await completeMultipartUpload(
      key,
      uploadId,
      parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber }))
    );

    const updated = await persistContentFile(id, { s3Key, cloudFrontUrl, fileSize, mimeType, duration });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'The lesson was deleted before the upload finished.' });
    }
    res.json({ success: true, data: { ...updated, cloudFrontUrl } });
  } catch (error) {
    console.error('Complete multipart error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete upload.' });
  }
};

const abortContentMultipart = async (req, res) => {
  try {
    const { uploadId, key } = req.body;
    if (uploadId && key) await abortMultipartUpload(key, uploadId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to abort upload.' });
  }
};

// PUT /api/admin/contents/:id
const updateContent = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    if (data.isFree !== undefined) data.isFree = data.isFree === true || data.isFree === 'true';
    if (data.duration) data.duration = parseInt(data.duration);

    const content = await prisma.content.update({ where: { id }, data });

    const section = await prisma.section.findUnique({
      where: { id: content.sectionId },
      select: { courseId: true },
    });
    if (section?.courseId) {
      await updateCourseStats(section.courseId);
    }

    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update content.' });
  }
};

// DELETE /api/admin/contents/:id
const deleteContent = async (req, res) => {
  try {
    const { id } = req.params;
    const content = await prisma.content.findUnique({
      where: { id },
      include: { section: { select: { courseId: true } } },
    });
    if (content?.s3Key) {
      await deleteFromS3(content.s3Key).catch(console.error);
    }
    await prisma.content.delete({ where: { id } });
    if (content?.section?.courseId) {
      await updateCourseStats(content.section.courseId);
    }
    res.json({ success: true, message: 'Content deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete content.' });
  }
};

// GET /api/student/contents/:id - Get content for enrolled student
const getContentForStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const content = await prisma.content.findUnique({
      where: { id },
      include: { section: { select: { courseId: true } } },
    });

    if (!content) return res.status(404).json({ success: false, message: 'Content not found.' });

    // Check if it's a free preview or if user is admin
    const canAccess = content.isFree || req.user.role === 'ADMIN';

    if (!canAccess) {
      // Check enrollment
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: { userId: req.user.id, courseId: content.section.courseId },
        },
      });

      if (!enrollment || enrollment.status !== 'ACTIVE') {
        return res.status(403).json({ success: false, message: 'You are not enrolled in this course.' });
      }
    }

    // Get streamable URL (presigned S3 URL or local upload URL)
    let streamUrl = content.cloudFrontUrl;
    if (content.s3Key) {
      try {
        streamUrl = await getPresignedDownloadUrl(content.s3Key, 7200); // 2 hours
      } catch (err) {
        console.warn('Could not generate presigned download URL, using cloudFrontUrl:', err.message);
      }
    }

    res.json({ success: true, data: { ...content, cloudFrontUrl: streamUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get content.' });
  }
};

// POST /api/student/contents/:id/progress
const updateProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { watchedSeconds, lastPosition, isCompleted } = req.body;

    // Never decrement watchedSeconds (only advance)
    const existing = await prisma.contentProgress.findUnique({
      where: { userId_contentId: { userId: req.user.id, contentId: id } },
    });

    const newWatchedSeconds = watchedSeconds !== undefined
      ? Math.max(watchedSeconds, existing?.watchedSeconds || 0)
      : undefined;

    const progress = await prisma.contentProgress.upsert({
      where: { userId_contentId: { userId: req.user.id, contentId: id } },
      update: {
        ...(newWatchedSeconds !== undefined && { watchedSeconds: newWatchedSeconds }),
        ...(lastPosition !== undefined && { lastPosition }),
        ...(isCompleted && !existing?.isCompleted && {
          isCompleted: true,
          completedAt: new Date(),
        }),
      },
      create: {
        userId: req.user.id,
        contentId: id,
        watchedSeconds: watchedSeconds || 0,
        lastPosition: lastPosition || 0,
        isCompleted: isCompleted || false,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    // Update overall course progress + last accessed timestamp
    const content = await prisma.content.findUnique({
      where: { id },
      include: { section: { select: { courseId: true } } },
    });

    if (content) {
      const courseId = content.section.courseId;

      // Update lastAccessedAt on enrollment
      await prisma.enrollment.updateMany({
        where: { userId: req.user.id, courseId },
        data: { lastAccessedAt: new Date() },
      });

      // Recalculate completion percentage
      const [totalContents, completedContents] = await Promise.all([
        prisma.content.count({
          where: { section: { courseId }, isPublished: true },
        }),
        prisma.contentProgress.count({
          where: {
            userId: req.user.id,
            isCompleted: true,
            content: { section: { courseId } },
          },
        }),
      ]);

      const progressPercent = totalContents > 0 ? (completedContents / totalContents) * 100 : 0;

      await prisma.enrollment.updateMany({
        where: { userId: req.user.id, courseId },
        data: {
          progressPercent,
          ...(progressPercent >= 100 ? { status: 'COMPLETED', completedAt: new Date() } : {}),
        },
      });

      if (progressPercent >= 100) {
        const existingCert = await prisma.certificate.findUnique({
          where: { userId_courseId: { userId: req.user.id, courseId } },
        });

        if (!existingCert) {
          const certCount = await prisma.certificate.count();
          const certNo = `CERT-${new Date().getFullYear()}-${String(certCount + 1).padStart(6, '0')}`;
          await prisma.certificate.create({
            data: {
              userId: req.user.id,
              courseId,
              certificateNo: certNo,
            },
          }).catch((err) => console.error('Certificate auto-issue error:', err.message));
        }
      }
    }

    res.json({ success: true, data: progress });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ success: false, message: 'Failed to update progress.' });
  }
};


// POST /api/courses/content/:id/duration - Sync video duration
const syncContentDuration = async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.body;
    if (!duration || isNaN(duration)) {
      return res.status(400).json({ success: false, message: 'Valid duration in seconds required.' });
    }
    const content = await prisma.content.findUnique({
      where: { id },
      include: { section: { select: { courseId: true } } },
    });
    if (!content) return res.status(404).json({ success: false, message: 'Content not found.' });

    await prisma.content.update({
      where: { id },
      data: { duration: Math.round(Number(duration)) },
    });
    if (content.section?.courseId) {
      await updateCourseStats(content.section.courseId);
    }
    res.json({ success: true, message: 'Duration synced.' });
  } catch (err) {
    console.error('Error syncing duration:', err);
    res.status(500).json({ success: false, message: 'Failed to sync duration.' });
  }
};

module.exports = {
  createSection, updateSection, deleteSection, reorderSections,
  createContent, uploadContent, getPresignedUrl, updateContent, deleteContent,
  getContentForStudent, updateProgress, syncContentDuration,
  initContentMultipart, completeContentMultipart, abortContentMultipart,
};
