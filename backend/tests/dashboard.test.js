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
      expect(data.pulse).toHaveProperty('integrity');
      expect(data.pulse.integrity).toHaveProperty('target', 100);
      expect(data.pulse.integrity).toHaveProperty('components');
      expect(data.pulse).toHaveProperty('quarantine');
      expect(data.pulse.quarantine).toHaveProperty('status');

      // 2. Verify Charts data structure
      expect(data).toHaveProperty('charts');
      expect(data.charts).toHaveProperty('funnel');
      expect(data.charts.funnel).toHaveProperty('total');
      expect(data.charts).toHaveProperty('integrityBreakdown');
      expect(data.charts.integrityBreakdown).toHaveProperty('flags');
      expect(data.charts).toHaveProperty('systemHealth');
      expect(data.charts.systemHealth).toHaveProperty('score');
      expect(data.charts.systemHealth).toHaveProperty('components');
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

    it('should return integrity with component breakdown', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const integrity = res.body.pulse.integrity;
      expect(integrity).toHaveProperty('value');
      expect(integrity).toHaveProperty('status');
      expect(integrity).toHaveProperty('components');
      
      if (integrity.components) {
        expect(integrity.components).toHaveProperty('aiModel');
        expect(integrity.components).toHaveProperty('backend');
        expect(integrity.components).toHaveProperty('studentContainers');
        expect(integrity.components).toHaveProperty('adminService');
      }
    });

    it('should return systemHealth in charts', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const systemHealth = res.body.charts.systemHealth;
      expect(systemHealth).toHaveProperty('score');
      expect(systemHealth).toHaveProperty('status');
      expect(systemHealth).toHaveProperty('summary');
      expect(systemHealth.summary).toHaveProperty('healthyComponents');
      expect(systemHealth.summary).toHaveProperty('totalComponents');
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

  describe('GET /api/admin/system-health', () => {
    it('should reject requests without a valid token', async () => {
      const res = await request(app).get('/api/admin/system-health');
      expect(res.status).toBe(401);
    });

    it('should return 200 and system health data for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      const data = res.body;

      expect(data).toHaveProperty('score');
      expect(typeof data.score).toBe('number');
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);

      expect(data).toHaveProperty('status');
      expect(['On Track', 'At Risk', 'Critical']).toContain(data.status);

      expect(data).toHaveProperty('healthStatus');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.healthStatus);

      expect(data).toHaveProperty('components');
      expect(data.components).toHaveProperty('aiModel');
      expect(data.components).toHaveProperty('backend');
      expect(data.components).toHaveProperty('studentContainers');
      expect(data.components).toHaveProperty('adminService');

      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('healthyComponents');
      expect(data.summary).toHaveProperty('totalComponents');
      expect(data.summary.totalComponents).toBe(4);

      expect(data).toHaveProperty('lastChecked');
    });

    it('should return correct component structure', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);

      const { aiModel, backend, studentContainers, adminService } = res.body.components;

      expect(aiModel).toHaveProperty('name');
      expect(aiModel).toHaveProperty('healthy');
      expect(aiModel).toHaveProperty('score');
      expect(aiModel).toHaveProperty('weight');
      expect(aiModel.weight).toBe(25);

      expect(backend).toHaveProperty('name');
      expect(backend).toHaveProperty('healthy');
      expect(backend).toHaveProperty('score');
      expect(backend).toHaveProperty('weight');

      expect(studentContainers).toHaveProperty('name');
      expect(studentContainers).toHaveProperty('healthy');
      expect(studentContainers).toHaveProperty('score');
      expect(studentContainers).toHaveProperty('weight');

      expect(adminService).toHaveProperty('name');
      expect(adminService).toHaveProperty('healthy');
      expect(adminService).toHaveProperty('score');
      expect(adminService).toHaveProperty('weight');
    });

    it('should calculate score correctly (sum of component scores)', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);

      const { components, score } = res.body;
      const calculatedScore = components.aiModel.score + 
                              components.backend.score + 
                              components.studentContainers.score + 
                              components.adminService.score;
      
      expect(score).toBe(calculatedScore);
    });

    it('should return On Track status for high scores', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      if (res.body.score >= 85) {
        expect(res.body.status).toBe('On Track');
      }
    });

    it('should include backend health details', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const { backend } = res.body.components;
      expect(backend.details).toHaveProperty('express');
      expect(backend.details).toHaveProperty('redis');
      expect(backend.details).toHaveProperty('mongodb');
    });

    it('should include admin service details', async () => {
      const res = await request(app)
        .get('/api/admin/system-health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      
      const { adminService } = res.body.components;
      expect(adminService.details).toHaveProperty('adminCount');
      expect(adminService.details.adminCount).toBeGreaterThanOrEqual(0);
    });
  });
});
