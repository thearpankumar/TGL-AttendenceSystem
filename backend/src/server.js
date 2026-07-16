const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const connectDB = require('./config/db');
const { initializeRedis, closeRedis, isRedisConnected } = require('./config/redis');
const config = require('./config');
const { initializeStorage } = require('./storage');
const logger = require('./utils/logger');

const app = express();

// Trust proxy (needed for real IP behind Caddy)
app.set('trust proxy', 1);

// ─── Attach a unique requestId to every request ───────────────────────────
app.use((req, _res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// ─── HTTP request/response logging via pino-http ──────────────────────────
if (config.nodeEnv !== 'test') {
  app.use(pinoHttp({
    logger,
    // Redact sensitive headers from log output
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
    // Customise the log message per request
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
    // Attach requestId from express-request-id to log context
    genReqId: (req) => req.id,
    // Auto-log level based on status code
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }));
}

if (config.nodeEnv !== 'test') {
  connectDB();
  initializeRedis();
}

// Initialize storage in all environments (including test) so that
// /api/storage-info and attendance endpoints work correctly.
try {
  initializeStorage(config.storage);
} catch (storageErr) {
  // In test env the credentials are fake — that's expected.
  // Errors only matter at upload time, not at initialization.
  logger.warn({ err: storageErr }, 'Storage init warning');
}

app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", config.corsOrigin, "https:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// ─── Health & info endpoints ──────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/storage-info', (req, res) => {
  const { getStorageProvider } = require('./storage');
  try {
    const storage = getStorageProvider();
    res.json({
      provider: storage.getName(),
      supportsDirectUpload: typeof storage.getUploadUrl === 'function',
    });
  } catch (_error) {
    res.json({ provider: 'not-initialized' });
  }
});

app.get('/health/ready', (req, res) => {
  const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    redis: redisStatus
  });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ─── Prometheus metrics endpoint ──────────────────────────────────────────
// Exposed at /metrics; the Prometheus scrape job hits this via dns_sd_configs.
// Guarded from test env to avoid registering duplicate metrics across test suites.
if (config.nodeEnv !== 'test') {
  const promClient = require('prom-client');
  // Collect default Node.js metrics: event loop lag, GC, heap, etc.
  promClient.collectDefaultMetrics({ prefix: 'attendix_' });

  app.get('/metrics', async (req, res) => {
    try {
      // Trigger system health calculation so metrics are fresh on every scrape
      const { getSystemIntegrityScore } = require('./services/systemHealth');
      await getSystemIntegrityScore();

      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });
}

// ─── Application routes ───────────────────────────────────────────────────
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/config', require('./routes/configRoutes'));
app.use('/api/attend', require('./routes/studentRoutes'));
app.use('/api/device', require('./routes/deviceVerificationRoutes'));
app.use('/api/logs/client', require('./routes/clientLogRoutes'));
app.use('/s', require('./routes/shortLinkRoutes'));
app.use('/s', require('./routes/webauthnRoutes'));

// ─── 404 handler ─────────────────────────────────────────────────────────
app.use((req, res, _next) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const log = req.log || logger;
  log.error({ err, requestId: req.id }, 'Unhandled error');
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ 
    message: err.message || 'Something went wrong!',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
});

// ─── Start server ─────────────────────────────────────────────────────────
if (config.nodeEnv !== 'test') {
  const PORT = config.port;
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: config.nodeEnv }, 'Server started');
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
    });
    await closeRedis();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received — shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
    });
    await closeRedis();
    process.exit(0);
  });
}

module.exports = app;
