const request = require('supertest');
const app = require('../src/server'); // Assuming this exports the express app
const Admin = require('../src/models/Admin');
describe('Dashboard Endpoints (/api/admin/dashboard)', () => {
  let adminToken;
  let adminId;

  beforeEach(async () => {
    // Note: Assuming a global database connection is established in setup.js/dbSetup.js
    const adminRes = await request(app)
      .post('/api/admin/register')
      .send({
        username: 'dashadmin',
        email: 'dashadmin@test.com',
        password: 'Password123!',
        adminSecret: 'test-admin-secret'
      });
      
    if (adminRes.status === 201) {
      adminId = adminRes.body.admin._id;
      adminToken = adminRes.body.token;
    } else {
      console.error('Registration failed in test:', adminRes.body);
    }
  });

  describe('GET /api/admin/dashboard', () => {
    it('should reject requests without a valid token', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(401);
    });

    it('should return 200 and the structured dashboard payload for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      const data = res.body;

      // 1. Verify Pulse Metrics structure
      expect(data).toHaveProperty('pulse');
      expect(data.pulse).toHaveProperty('eligibility');
      expect(data.pulse.eligibility).toHaveProperty('target', 90);
      expect(data.pulse).toHaveProperty('quarantine');
      expect(data.pulse.quarantine).toHaveProperty('status');

      // 2. Verify Charts data structure
      expect(data).toHaveProperty('charts');
      expect(data.charts).toHaveProperty('funnel');
      expect(data.charts.funnel).toHaveProperty('total');
      expect(data.charts).toHaveProperty('integrityBreakdown');
      expect(data.charts.integrityBreakdown).toHaveProperty('flags');
      expect(data.charts).toHaveProperty('weeklyTrends');
      expect(Array.isArray(data.charts.weeklyTrends)).toBe(true);

      // 3. Verify Worklists data structure
      expect(data).toHaveProperty('worklists');
      expect(data.worklists).toHaveProperty('rescueList');
      expect(Array.isArray(data.worklists.rescueList)).toBe(true);
      expect(data.worklists).toHaveProperty('quarantineList');
      expect(Array.isArray(data.worklists.quarantineList)).toBe(true);
      expect(data.worklists).toHaveProperty('lowBatches');
      expect(Array.isArray(data.worklists.lowBatches)).toBe(true);

      // Verify that timestamps are provided
      expect(data).toHaveProperty('lastUpdated');
    });

    it('should verify the rescue list entries contain required placement action fields', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const rescueList = res.body.worklists.rescueList;
      if (rescueList.length > 0) {
        const student = rescueList[0];
        expect(student).toHaveProperty('rollNo');
        expect(student).toHaveProperty('name');
        expect(student).toHaveProperty('batch');
        expect(student).toHaveProperty('attendance');
        expect(student).toHaveProperty('trend');
      }
    });
  });

  describe('GET /api/admin/dashboard/filters', () => {
    it('should reject requests without a valid token', async () => {
      const res = await request(app).get('/api/admin/dashboard/filters');
      expect(res.status).toBe(401);
    });

    it('should return 200 and filter options for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/filters')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      const data = res.body;

      expect(data).toHaveProperty('batches');
      expect(Array.isArray(data.batches)).toBe(true);
      expect(data.batches.length).toBeGreaterThan(0);
      expect(data.batches[0]).toHaveProperty('value');
      expect(data.batches[0]).toHaveProperty('label');

      expect(data).toHaveProperty('centers');
      expect(Array.isArray(data.centers)).toBe(true);
      expect(data.centers.length).toBeGreaterThan(0);
      expect(data.centers[0]).toHaveProperty('value');
      expect(data.centers[0]).toHaveProperty('label');

      expect(data).toHaveProperty('timeframes');
      expect(Array.isArray(data.timeframes)).toBe(true);
      expect(data.timeframes.length).toBeGreaterThan(0);

      expect(data).toHaveProperty('riskLevels');
      expect(Array.isArray(data.riskLevels)).toBe(true);
      expect(data.riskLevels).toContain('All Levels');
    });

    it('should return "All Batches" as first batch option', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/filters')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.batches[0]).toEqual({ value: 'all', label: 'All Batches' });
    });

    it('should return "All Centers" as first center option', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/filters')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.centers[0]).toEqual({ value: 'all', label: 'All Centers' });
    });

    it('should return timeframes with This Week, Today, Yesterday, This Month', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/filters')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      const timeframes = res.body.timeframes;
      
      expect(timeframes.some(t => t.includes('This Week'))).toBe(true);
      expect(timeframes.some(t => t.includes('Today'))).toBe(true);
      expect(timeframes.some(t => t.includes('Yesterday'))).toBe(true);
      expect(timeframes.some(t => t.includes('This Month'))).toBe(true);
    });

    it('should return risk levels in correct order', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard/filters')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.riskLevels).toEqual(['All Levels', 'High Risk', 'Medium Risk', 'Low Risk']);
    });
  });
});
