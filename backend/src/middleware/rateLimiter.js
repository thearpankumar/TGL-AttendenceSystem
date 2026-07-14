const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient, isRedisConnected } = require('../config/redis');

// Evaluate per-request so tests that set NODE_ENV=test after module load are covered.
const isTest = () => process.env.NODE_ENV === 'test';

// ponytail: the store is picked once per limiter from Redis's connection
// state at creation time. If Redis drops after RedisStore was already
// chosen, ioredis's own retries (maxRetriesPerRequest: 3, see config/redis.js)
// absorb brief blips; a sustained outage would surface as limiter errors.
// Upgrade path: a store wrapper that re-checks isRedisConnected() per
// request, if that ever becomes a real problem.
function buildStore(prefix) {
  if (!isRedisConnected()) return undefined; // express-rate-limit falls back to its in-memory store
  return new RedisStore({
    sendCommand: (...args) => getRedisClient().call(...args),
    prefix,
  });
}

function createAdminLimiter({ skip = isTest } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('rl:admin:'),
    skip,
    message: {
      message: 'Too many requests, please try again later',
    },
  });
}

function createStudentLimiter({ skip = isTest } = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    store: buildStore('rl:student:'),
    skip,
    message: {
      message: 'Too many submissions, please wait',
    },
  });
}

function createLoginLimiter({ skip = isTest } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('rl:login:'),
    skip,
    message: {
      message: 'Too many login attempts, please try again later',
    },
  });
}

function createRegistrationLimiter({ skip = isTest } = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('rl:registration:'),
    skip,
    message: {
      message: 'Too many registration attempts, please try again later',
    },
  });
}

function createClientLogLimiter({ skip = isTest } = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('rl:clientlog:'),
    skip,
    message: {
      message: 'Too many error logs submitted, please slow down',
    },
  });
}

module.exports = {
  adminLimiter: createAdminLimiter(),
  studentLimiter: createStudentLimiter(),
  loginLimiter: createLoginLimiter(),
  registrationLimiter: createRegistrationLimiter(),
  clientLogLimiter: createClientLogLimiter(),
  createAdminLimiter,
  createStudentLimiter,
  createLoginLimiter,
  createRegistrationLimiter,
  createClientLogLimiter,
  buildStore,
};
