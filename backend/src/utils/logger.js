'use strict';

/**
 * Centralised Pino logger singleton.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info({ module: 'auth' }, 'User authenticated');
 *   const reqLog = logger.child({ requestId: req.id, module: 'attendance' });
 *   reqLog.warn({ rollNumber }, 'Geofence violation');
 *
 * In NODE_ENV=test, all output is suppressed (level: silent).
 * In development, logs are pretty-printed to stdout.
 * In production, logs are emitted as compact JSON for Alloy/Loki ingestion.
 */

const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';
const isDev  = process.env.NODE_ENV === 'development';

let hasPinoPretty = false;
try {
  require.resolve('pino-pretty');
  hasPinoPretty = true;
} catch (_e) {
  // pino-pretty is not installed (e.g. Docker --omit=dev build)
}

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),

  // Rename 'msg' → 'message' so Loki's JSON stage can index it natively.
  // Rename 'time' → 'timestamp' and emit as ISO-8601 string.
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,

  // Output string levels ('info', 'warn', 'error') instead of integers (30, 40, 50)
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },

  // Static fields attached to every log line
  base: {
    service: 'attendix-backend',
    env: process.env.NODE_ENV || 'development',
  },

  // Serialise native Error objects into { message, stack, type }
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Pretty-print only in development if pino-pretty is installed
  transport: (isDev && hasPinoPretty)
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service,env',
        },
      }
    : undefined,
});

module.exports = logger;
