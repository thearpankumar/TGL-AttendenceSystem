const request = require('supertest');
const app = require('../src/server');

describe('Client Log Aggregation API', () => {
  describe('POST /api/logs/client', () => {
    it('should accept valid error log payload and return 202', async () => {
      const res = await request(app)
        .post('/api/logs/client')
        .send({
          message: 'Test UI Crash',
          stack: 'Error: Test UI Crash\n    at Component (app.js:10:5)',
          componentStack: '\n    in Component\n    in ErrorBoundary',
          url: 'http://localhost/student',
          userAgent: 'Mozilla/5.0 TestBrowser',
          appName: 'StudentFrontend'
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
    });

    it('should reject payload missing both message and stack', async () => {
      const res = await request(app)
        .post('/api/logs/client')
        .send({
          url: 'http://localhost/student',
          appName: 'StudentFrontend'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing error details');
    });
  });
});
