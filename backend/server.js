const Sentry = require('./src/instrument'); // must load before anything else (error monitoring)
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/index');
const courseRoutes = require('./src/routes/courses');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { ensureBucketCors } = require('./src/config/aws');
const { startCleanupScheduler } = require('./src/jobs/cleanup');
const cache = require('./src/config/cache');
const logger = require('./src/config/logger');

const isProd = process.env.NODE_ENV === 'production';

// ==================== CORS ====================
// Only our own frontends. Set CLIENT_URL to a comma-separated list for extra origins (e.g. a preview URL).
const allowedOrigins = new Set([
  // Deployed frontends (Vercel production and the Render static site)
  'https://derivion-lms.vercel.app',
  'https://derivion-lms-1.onrender.com',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean) : []),
  ...(isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
]);

// ==================== RATE LIMITING ====================
// Logged-in users are limited per account (a whole school shares one IP); anonymous traffic per IP.
const userKey = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const { userId } = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (userId) return `u:${userId}`;
    } catch { /* fall back to IP */ }
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
};

const buildLimiters = (redis) => {
  const store = (name) => (redis
    ? new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix: `lms:rl:${name}:` })
    : undefined);
  const base = { standardHeaders: 'draft-7', legacyHeaders: false, passOnStoreError: true };

  return {
    api: rateLimit({
      ...base,
      store: store('api'),
      windowMs: 5 * 60 * 1000,
      keyGenerator: userKey,
      limit: (req) => (userKey(req).startsWith('u:') ? 1500 : 600),
      message: { success: false, message: 'Too many requests, please slow down and try again shortly.' },
    }),
    // Failed logins per account+IP: a class logging in together never locks each other out
    login: rateLimit({
      ...base,
      store: store('login'),
      windowMs: 15 * 60 * 1000,
      limit: 10,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || req.body?.username || '').toLowerCase().slice(0, 100)}`,
      message: { success: false, message: 'Too many failed login attempts for this account. Try again in 15 minutes.' },
    }),
    // Account-creation and email-sending endpoints
    sensitive: rateLimit({
      ...base,
      store: store('sensitive'),
      windowMs: 15 * 60 * 1000,
      limit: 30,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      message: { success: false, message: 'Too many attempts. Please try again later.' },
    }),
    clientErrors: rateLimit({
      ...base,
      store: store('clienterr'),
      windowMs: 60 * 1000,
      limit: 20,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      message: { success: false },
    }),
  };
};

// Wait briefly for Redis so limiters can use the shared store; otherwise they use process memory
const waitForRedis = (ms) => new Promise((resolve) => {
  if (!cache.rawRedis) return resolve(null);
  if (cache.isRedisReady()) return resolve(cache.rawRedis);
  const timer = setTimeout(() => resolve(null), ms);
  cache.rawRedis.once('ready', () => { clearTimeout(timer); resolve(cache.rawRedis); });
});

const createApp = (limiters) => {
  const app = express();

  // Trust the first proxy (Render / Nginx / Cloudflare) so req.ip is the real client
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(Object.assign(new Error('Origin not allowed by CORS'), { status: 403 }));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Raw body for webhook signature verification (must precede express.json)
  app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Locally stored uploads (only used when S3 is not configured, i.e. development)
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use(morgan(isProd ? 'combined' : 'dev', {
    stream: { write: (line) => logger.info(line.trim()) },
  }));

  // Uploads may legitimately take a long time; everything else gets a request timeout
  app.use((req, res, next) => {
    const isUpload = /\/(upload|upload-video|upload-document|thumbnail|avatar|multipart|import)/.test(req.path);
    req.setTimeout(isUpload ? 0 : 60 * 1000);
    next();
  });

  // ==================== ROUTES ====================
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'Derivion LMS API is running',
      timestamp: new Date().toISOString(),
      cache: cache.isRedisReady() ? 'redis' : 'memory',
    });
  });

  // Frontend crash reports (error boundary)
  app.post('/api/client-errors', limiters.clientErrors, (req, res) => {
    const { message, stack, url, digest } = req.body || {};
    logger.error('Client error', {
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 4000),
      url: String(url || '').slice(0, 500),
      digest: String(digest || '').slice(0, 100),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    });
    res.status(204).end();
  });

  app.use('/api/auth/login', limiters.login);
  app.use(['/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-email', '/api/auth/resend-verification', '/api/auth/verify-otp', '/api/auth/resend-otp'], limiters.sensitive);
  app.use('/api', limiters.api);

  app.use('/api/auth', authRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api', apiRoutes);

  // ==================== ERROR HANDLING ====================
  app.use(notFound);
  if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
};

const start = async () => {
  const redis = await waitForRedis(3000);
  logger.info(`Rate limits and cache using ${redis ? 'Redis' : 'in-memory store'}`);
  const app = createApp(buildLimiters(redis));

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    logger.info(`Derivion LMS API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    ensureBucketCors();
    startCleanupScheduler();
  });

  // Slow-client protection; long uploads opt out per request above
  server.headersTimeout = 65 * 1000;
  server.requestTimeout = 0; // per-request timeouts are set by middleware
  server.keepAliveTimeout = 61 * 1000;

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason instanceof Error ? reason.stack : String(reason) });
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});

if (require.main === module) {
  start();
}

module.exports = { createApp, buildLimiters };
