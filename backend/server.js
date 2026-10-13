require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/index');
const courseRoutes = require('./src/routes/courses');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { ensureBucketCors } = require('./src/config/aws');
const { startCleanupScheduler } = require('./src/jobs/cleanup');

const app = express();

// Trust proxy for Render / Cloudflare reverse proxies (required by express-rate-limit)
app.set('trust proxy', 1);

// ==================== SECURITY MIDDLEWARE ====================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://derivion-lms-1.onrender.com',
  'https://derivion-lms.vercel.app',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map(s => s.trim()) : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-webhook-signature', 'x-webhook-timestamp'],
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 200,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// ==================== BODY PARSING ====================
// Raw body for webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve locally uploaded files (videos, thumbnails, documents)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== LOGGING ====================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Derivion LMS API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api', apiRoutes);

// ==================== ERROR HANDLING ====================
app.use(notFound);
app.use(errorHandler);

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🎓 Derivion LMS API Server          ║
  ║   🚀 Running on port ${PORT}             ║
  ║   🌍 Environment: ${process.env.NODE_ENV || 'development'}       ║
  ╚═══════════════════════════════════════╝
  `);
  ensureBucketCors();
  startCleanupScheduler();
});

// Large video uploads must not be killed by Node's default 5-minute request timeout
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;

module.exports = app;
