const express = require('express');
const request = require('supertest');
const { createLoginLimiter, buildStore } = require('../src/middleware/rateLimiter');

function buildTestApp(limiter) {
  const app = express();
  app.get('/test-login', limiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('rate limiter enforcement', () => {
  it('returns 429 once the login limiter max is exceeded within the window', async () => {
    const limiter = createLoginLimiter({ skip: () => false });
    const app = buildTestApp(limiter);

    let lastRes;
    for (let i = 0; i < 6; i++) {
      lastRes = await request(app).get('/test-login');
    }

    expect(lastRes.status).toBe(429);
    expect(lastRes.body.message).toBe('Too many login attempts, please try again later');
  });

  it('does not limit when left at the default isTest() skip (NODE_ENV=test)', async () => {
    const limiter = createLoginLimiter();
    const app = buildTestApp(limiter);

    const results = await Promise.all(
      Array(10)
        .fill(null)
        .map(() => request(app).get('/test-login'))
    );

    results.forEach((res) => expect(res.status).toBe(200));
  });
});

describe('buildStore', () => {
  it('falls back to the in-memory store when Redis is not connected', () => {
    // server.js never calls initializeRedis() under NODE_ENV=test, so
    // isRedisConnected() is false here without any extra mocking.
    expect(buildStore('rl:test:')).toBeUndefined();
  });
});
