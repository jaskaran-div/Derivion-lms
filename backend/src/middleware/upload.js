const multer = require('multer');

// Use memory storage for S3 uploads
const storage = multer.memoryStorage();

const fileFilter = (allowedMimes) => (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`), false);
  }
};

// For video uploads
const videoUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter: fileFilter([
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
  ]),
});

// For document/PDF uploads
const documentUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: fileFilter([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ]),
});

// For image uploads (thumbnails, avatars)
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ]),
});

// General file upload
const generalUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

module.exports = { videoUpload, documentUpload, imageUpload, generalUpload };
