const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Check if real AWS credentials and bucket are provided
 */
const isAwsConfigured = () => {
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET;
  return (
    Boolean(key) &&
    key !== 'your_aws_access_key' &&
    key.trim() !== '' &&
    Boolean(secret) &&
    secret !== 'your_aws_secret_key' &&
    secret.trim() !== '' &&
    Boolean(bucket) &&
    bucket !== 'your-bucket-name' &&
    bucket.trim() !== ''
  );
};

const REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET = () => process.env.AWS_S3_BUCKET;

const s3 = new S3Client({
  region: REGION,
  // Browsers upload parts through presigned URLs and cannot add SDK checksum headers
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  ...(isAwsConfigured() && {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),
});

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

/**
 * Get base URL of backend for serving local uploads
 */
const getBackendBaseUrl = () => {
  const port = process.env.PORT || 5000;
  return process.env.BACKEND_URL || `http://localhost:${port}`;
};

/**
 * Generate a unique S3 key for a file
 */
const generateS3Key = (folder, originalName) => {
  const ext = path.extname(originalName || '');
  const uniqueName = `${uuidv4()}${ext}`;
  return `${folder}/${uniqueName}`;
};

/**
 * Upload to local disk storage
 */
const uploadLocally = async (buffer, key) => {
  const normalizedKey = key.replace(/\\/g, '/');
  const uploadsDir = path.join(__dirname, '../../uploads');
  const fullPath = path.join(uploadsDir, ...normalizedKey.split('/'));

  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);

  const localUrl = `${getBackendBaseUrl()}/uploads/${normalizedKey}`;
  return {
    s3Key: `local://${normalizedKey}`,
    cloudFrontUrl: localUrl,
    s3Url: localUrl,
  };
};

/**
 * Get CloudFront URL for a given S3 key
 */
const getCloudFrontUrl = (s3Key) => {
  if (!s3Key) return '';
  if (s3Key.startsWith('local://')) {
    const rel = s3Key.replace('local://', '');
    return `${getBackendBaseUrl()}/uploads/${rel}`;
  }
  if (!CLOUDFRONT_DOMAIN || CLOUDFRONT_DOMAIN.includes('your-cloudfront-domain')) {
    return `https://${BUCKET()}.s3.${REGION}.amazonaws.com/${s3Key}`;
  }
  return `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;
};

/**
 * Upload a buffer/stream to S3 with local disk fallback
 */
const uploadToS3 = async (buffer, key, contentType) => {
  if (!isAwsConfigured()) {
    console.log(`[Storage] AWS credentials not configured. Storing locally: ${key}`);
    return uploadLocally(buffer, key);
  }

  try {
    const upload = new Upload({
      client: s3,
      params: { Bucket: BUCKET(), Key: key, Body: buffer, ContentType: contentType },
      partSize: 8 * 1024 * 1024,
      queueSize: 4,
    });
    const result = await upload.done();
    return {
      s3Key: key,
      cloudFrontUrl: getCloudFrontUrl(key),
      s3Url: result.Location || getCloudFrontUrl(key),
    };
  } catch (s3Error) {
    console.warn(`[Storage] AWS S3 upload failed (${s3Error.message}). Falling back to local storage.`);
    return uploadLocally(buffer, key);
  }
};

const ensureBucketCors = async () => {
  if (!isAwsConfigured()) return;
  const origins = [
    ...(process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((s) => s.trim()),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [...new Set(origins)],
            AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-id-2'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }));
    console.log('[Storage] S3 bucket CORS configured for browser uploads.');
  } catch (err) {
    console.warn(`[Storage] Could not set S3 CORS (${err.message}). Direct browser uploads may fail until CORS is set on the bucket.`);
  }
};

const createMultipartUpload = async (key, contentType) => {
  const result = await s3.send(new CreateMultipartUploadCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
  }));
  return result.UploadId;
};

const getUploadPartUrl = async (key, uploadId, partNumber) =>
  getSignedUrl(
    s3,
    new UploadPartCommand({ Bucket: BUCKET(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 3600 }
  );

const completeMultipartUpload = async (key, uploadId, parts) => {
  const result = await s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber),
    },
  }));
  return {
    s3Key: key,
    cloudFrontUrl: getCloudFrontUrl(key),
    s3Url: result.Location || getCloudFrontUrl(key),
  };
};

const abortMultipartUpload = async (key, uploadId) => {
  try {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET(), Key: key, UploadId: uploadId }));
  } catch (err) {
    console.warn(`[Storage] Abort multipart failed: ${err.message}`);
  }
};

/**
 * Delete a file from S3 or local disk
 */
const deleteFromS3 = async (key) => {
  if (!key) return;

  if (key.startsWith('local://')) {
    const relPath = key.replace('local://', '');
    const uploadsDir = path.join(__dirname, '../../uploads');
    const fullPath = path.join(uploadsDir, ...relPath.split('/'));
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
    return;
  }

  if (!isAwsConfigured()) return;

  try {
    return await s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
  } catch (err) {
    console.error('Delete from S3 error:', err.message);
  }
};

/**
 * Get a presigned download URL (for private content)
 */
const getPresignedDownloadUrl = async (key, expiresIn = 3600) => {
  if (!key || key.startsWith('local://')) {
    const rel = (key || '').replace('local://', '');
    return `${getBackendBaseUrl()}/uploads/${rel}`;
  }

  if (!isAwsConfigured()) {
    return getCloudFrontUrl(key);
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET(), Key: key, ResponseContentDisposition: 'inline' }),
    { expiresIn }
  );
};

/**
 * Get a signed URL for direct client upload
 */
const getPresignedUploadUrl = async (key, contentType, expiresIn = 3600) => {
  if (!isAwsConfigured()) {
    throw new Error('Direct S3 upload is not configured. Use the standard upload endpoint.');
  }
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn }
  );
};

module.exports = {
  s3,
  isAwsConfigured,
  generateS3Key,
  getPresignedUploadUrl,
  getCloudFrontUrl,
  uploadToS3,
  deleteFromS3,
  getPresignedDownloadUrl,
  ensureBucketCors,
  createMultipartUpload,
  getUploadPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
};
