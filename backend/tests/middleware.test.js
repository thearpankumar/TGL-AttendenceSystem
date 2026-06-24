const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const express = require('express');
const Admin = require('../src/models/Admin');
const {
  validateAdmin,
  validateLogin,
  validateLocation,
  validateSession,
  validateAttendance
} = require('../src/middleware/validators');
const { protect } = require('../src/middleware/auth');

let mongoServer;
let app;
let admin;
let adminToken;

const createAuthApp = () => {
  const testApp = express();
  testApp.use(express.json());
  
  testApp.post('/test/admin', validateAdmin, (req, res) => {
    res.json({ valid: true });
  });
  
  testApp.post('/test/login', validateLogin, (req, res) => {
    res.json({ valid: true });
  });
  
  testApp.post('/test/location', validateLocation, (req, res) => {
    res.json({ valid: true });
  });
  
  testApp.post('/test/session', validateSession, (req, res) => {
    res.json({ valid: true });
  });
  
  testApp.post('/test/attendance', validateAttendance, (req, res) => {
    res.json({ valid: true });
  });
  
  testApp.get('/test/protected', protect, (req, res) => {
    res.json({ user: req.admin?.username || 'unknown' });
  });
  
  return testApp;
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createAuthApp();
  
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_EXPIRE = '7d';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Admin.deleteMany({});
  
  admin = await Admin.create({
    username: 'testadmin',
    email: 'admin@test.com',
    password: 'password123'
  });
  
  adminToken = require('../src/middleware/auth').generateToken(admin._id);
});

describe('Validator Middleware Tests', () => {
  describe('validateAdmin', () => {
    test('should pass valid admin data', async () => {
      const res = await request(app)
        .post('/test/admin')
        .send({
          username: 'testadmin',
          email: 'admin@test.com',
          password: 'password123'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
    
    test('should reject short username (< 3 chars)', async () => {
      const res = await request(app)
        .post('/test/admin')
        .send({
          username: 'ab',
          email: 'admin@test.com',
          password: 'password123'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });
    
    test('should reject invalid email', async () => {
      const res = await request(app)
        .post('/test/admin')
        .send({
          username: 'testadmin',
          email: 'notanemail',
          password: 'password123'
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should reject short password (< 6 chars)', async () => {
      const res = await request(app)
        .post('/test/admin')
        .send({
          username: 'testadmin',
          email: 'admin@test.com',
          password: '12345'
        });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe('validateLogin', () => {
    test('should pass valid login data', async () => {
      const res = await request(app)
        .post('/test/login')
        .send({
          username: 'testadmin',
          password: 'password123'
        });
      
      expect(res.status).toBe(200);
    });
    
    test('should reject missing username', async () => {
      const res = await request(app)
        .post('/test/login')
        .send({
          password: 'password123'
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should reject missing password', async () => {
      const res = await request(app)
        .post('/test/login')
        .send({
          username: 'testadmin'
        });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe('validateLocation', () => {
    test('should pass valid location data', async () => {
      const res = await request(app)
        .post('/test/location')
        .send({
          name: 'Test Location',
          latitude: 12.971,
          longitude: 77.594,
          radiusMeters: 100
        });
      
      expect(res.status).toBe(200);
    });
    
    test('should reject latitude > 90', async () => {
      const res = await request(app)
        .post('/test/location')
        .send({
          name: 'Test',
          latitude: 91,
          longitude: 77.594
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should reject radius < 10', async () => {
      const res = await request(app)
        .post('/test/location')
        .send({
          name: 'Test',
          latitude: 12.971,
          longitude: 77.594,
          radiusMeters: 5
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should accept latitude at boundaries', async () => {
      const res1 = await request(app)
        .post('/test/location')
        .send({
          name: 'North Pole',
          latitude: 90,
          longitude: 0
        });
      
      const res2 = await request(app)
        .post('/test/location')
        .send({
          name: 'South Pole',
          latitude: -90,
          longitude: 0
        });
      
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });
  
  describe('validateSession', () => {
    test('should pass valid session data', async () => {
      const res = await request(app)
        .post('/test/session')
        .send({
          locationId: '507f1f77bcf86cd799439011'
        });
      
      expect(res.status).toBe(200);
    });
    
    test('should reject invalid MongoDB ID', async () => {
      const res = await request(app)
        .post('/test/session')
        .send({
          locationId: 'invalid-id'
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should reject duration < 5 minutes', async () => {
      const res = await request(app)
        .post('/test/session')
        .send({
          locationId: '507f1f77bcf86cd799439011',
          durationMinutes: 4
        });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe('validateAttendance', () => {
    test('should pass valid attendance with photo', async () => {
      const res = await request(app)
        .post('/test/attendance')
        .send({
          studentName: 'John Doe',
          rollNumber: '21CS101',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.971,
          longitude: 77.594
        });
      
      expect(res.status).toBe(200);
    });
    
    test('should pass valid attendance with direct upload', async () => {
      const res = await request(app)
        .post('/test/attendance')
        .send({
          studentName: 'John Doe',
          rollNumber: '21CS101',
          directUpload: true,
          publicId: 'attendance-photos/test',
          latitude: 12.971,
          longitude: 77.594
        });
      
      expect(res.status).toBe(200);
    });
    
    test('should reject invalid photo format', async () => {
      const res = await request(app)
        .post('/test/attendance')
        .send({
          studentName: 'John Doe',
          rollNumber: '21CS101',
          photo: 'not-a-valid-photo',
          latitude: 12.971,
          longitude: 77.594
        });
      
      expect(res.status).toBe(400);
    });
    
    test('should reject invalid roll number format', async () => {
      const res = await request(app)
        .post('/test/attendance')
        .send({
          studentName: 'John Doe',
          rollNumber: '21-CS-101',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.971,
          longitude: 77.594
        });
      
      expect(res.status).toBe(400);
    });
  });
});

describe('Auth Middleware Tests', () => {
  test('should reject request without token', async () => {
    const res = await request(app).get('/test/protected');
    
    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });
  
  test('should reject request with invalid token format', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'InvalidToken');
    
    expect(res.status).toBe(401);
  });
  
  test('should accept request with valid token', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.user).toBe('testadmin');
  });
  
  test('should reject request with expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );
    
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${expiredToken}`);
    
    expect(res.status).toBe(401);
  });
  
  test('should reject request with malformed token', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer invalid.token.here');
    
    expect(res.status).toBe(401);
  });
});
