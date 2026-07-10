const mongoose = require('mongoose');
const request = require('supertest');
const Admin = require('../src/models/Admin');
const SystemConfig = require('../src/models/SystemConfig');
const { generateToken } = require('../src/middleware/auth');

let app;

beforeAll(async () => {
  app = require('../src/server');
});

describe('System Configuration API', () => {
  let token;
  let admin;

  beforeEach(async () => {
    await Admin.deleteMany({});
    await SystemConfig.deleteMany({});

    admin = await Admin.create({
      username: 'testadmin',
      email: 'admin@test.com',
      password: 'password123'
    });

    token = generateToken(admin._id);
  });

  describe('GET /api/config', () => {
    it('should return default config if none exists', async () => {
      const res = await request(app)
        .get('/api/config')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.devBypassEnabled).toBe(false);
    });
  });

  describe('POST /api/config/dev-bypass', () => {
    it('should reject without a password', async () => {
      const res = await request(app)
        .post('/api/config/dev-bypass')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true })
        .expect(400);

      expect(res.body.message).toBe('Missing required fields');
    });

    it('should reject with incorrect password', async () => {
      const res = await request(app)
        .post('/api/config/dev-bypass')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true, password: 'wrongpassword' })
        .expect(401);

      expect(res.body.message).toBe('Invalid password');
    });

    it('should update config with correct password', async () => {
      const res = await request(app)
        .post('/api/config/dev-bypass')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true, password: 'password123' })
        .expect(200);

      expect(res.body.message).toBe('Developer Bypass Mode updated successfully');
      expect(res.body.config.devBypassEnabled).toBe(true);
      
      const configInDb = await SystemConfig.findOne();
      expect(configInDb.devBypassEnabled).toBe(true);
      expect(configInDb.updatedBy.toString()).toBe(admin._id.toString());
    });
  });
});
