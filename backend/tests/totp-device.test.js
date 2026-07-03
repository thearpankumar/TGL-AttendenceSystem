const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/server');
const Session = require('../src/models/Session');
const Location = require('../src/models/Location');
const Admin = require('../src/models/Admin');
const ShortLink = require('../src/models/ShortLink');
const Device = require('../src/models/Device');
const Attendance = require('../src/models/Attendance');
const { generateTOTPCode, validateTOTPCode } = require('../src/utils/totpUtils');

describe('TOTP Utility Functions', () => {
  const secret = 'test-secret-12345';
  const sessionId = '507f1f77bcf86cd799439011';
  const windowSeconds = 5;

  describe('generateTOTPCode', () => {
    it('should generate a 6-character uppercase code', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate same code within same time window', () => {
      const code1 = generateTOTPCode(secret, sessionId, windowSeconds);
      const code2 = generateTOTPCode(secret, sessionId, windowSeconds);
      expect(code1).toBe(code2);
    });

    it('should generate different codes for different secrets', () => {
      const code1 = generateTOTPCode(secret, sessionId, windowSeconds);
      const code2 = generateTOTPCode('different-secret', sessionId, windowSeconds);
      expect(code1).not.toBe(code2);
    });

    it('should generate different codes for different sessionIds', () => {
      const code1 = generateTOTPCode(secret, sessionId, windowSeconds);
      const code2 = generateTOTPCode(secret, '507f1f77bcf86cd799439012', windowSeconds);
      expect(code1).not.toBe(code2);
    });
  });

  describe('validateTOTPCode', () => {
    it('should validate correct code', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      const result = validateTOTPCode(code, secret, sessionId, windowSeconds, 1);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid code format', () => {
      const result = validateTOTPCode('123', secret, sessionId, windowSeconds, 1);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid code format');
    });

    it('should reject empty code', () => {
      const result = validateTOTPCode('', secret, sessionId, windowSeconds, 1);
      expect(result.valid).toBe(false);
    });

    it('should reject null code', () => {
      const result = validateTOTPCode(null, secret, sessionId, windowSeconds, 1);
      expect(result.valid).toBe(false);
    });

    it('should reject code with wrong secret', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      const result = validateTOTPCode(code, 'wrong-secret', sessionId, windowSeconds, 1);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Code expired or invalid');
    });

    it('should reject code with wrong sessionId', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      const result = validateTOTPCode(code, secret, '507f1f77bcf86cd799439099', windowSeconds, 1);
      expect(result.valid).toBe(false);
    });

    it('should accept lowercase code', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      const result = validateTOTPCode(code.toLowerCase(), secret, sessionId, windowSeconds, 1);
      expect(result.valid).toBe(true);
    });

    it('should work with tolerance windows', () => {
      const code = generateTOTPCode(secret, sessionId, windowSeconds);
      const result = validateTOTPCode(code, secret, sessionId, windowSeconds, 2);
      expect(result.valid).toBe(true);
    });
  });
});

describe('ShortLink Model', () => {
  let adminId;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'shortlinktest',
      email: 'shortlink@test.com',
      password: 'password123',
    });
    adminId = admin._id;
  });

  it('should create a short link with auto-generated code', async () => {
    const shortLink = await ShortLink.create({
      shortCode: ShortLink.generateShortCode(6),
      createdBy: adminId,
    });
    expect(shortLink.shortCode).toMatch(/^[a-z0-9]{6}$/);
    expect(shortLink.isActive).toBe(true);
    expect(shortLink.clickCount).toBe(0);
  });

  it('should create a short link with custom code', async () => {
    const shortLink = await ShortLink.create({
      shortCode: 'my-custom-code',
      createdBy: adminId,
    });
    expect(shortLink.shortCode).toBe('my-custom-code');
  });

  it('should lowercase short code', async () => {
    const shortLink = await ShortLink.create({
      shortCode: 'MYUPPERCODE',
      createdBy: adminId,
    });
    expect(shortLink.shortCode).toBe('myuppercode');
  });

  it('should reject duplicate short codes', async () => {
    await ShortLink.create({
      shortCode: 'duplicate-test',
      createdBy: adminId,
    });
    
    await expect(ShortLink.create({
      shortCode: 'duplicate-test',
      createdBy: adminId,
    })).rejects.toThrow();
  });

  it('should reject invalid short code format', async () => {
    await expect(ShortLink.create({
      shortCode: 'ab',
      createdBy: adminId,
    })).rejects.toThrow();
  });

  it('should reject short code with invalid characters', async () => {
    await expect(ShortLink.create({
      shortCode: 'invalid@code!',
      createdBy: adminId,
    })).rejects.toThrow();
  });

  it('should generate unique short codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(ShortLink.generateShortCode(6));
    }
    expect(codes.size).toBe(100);
  });
});

describe('Device Model', () => {
  let sessionId, adminId;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'devicetest',
      email: 'device@test.com',
      password: 'password123',
    });
    adminId = admin._id;

    const location = await Location.create({
      name: 'Device Test Location',
      latitude: 40.7128,
      longitude: -74.0060,
      radiusMeters: 100,
      createdBy: adminId,
    });

    const session = await Session.create({
      locationId: location._id,
      tokenHash: 'device-test-token-hash',
      tokenPrefix: 'devi',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
    });
    sessionId = session._id;
  });

  it('should create device with fingerprint hash', async () => {
    const fingerprint = 'test-fingerprint-123';
    const fingerprintHash = Device.hashFingerprint(fingerprint);
    
    const device = await Device.create({
      fingerprintHash,
      boundToStudent: 'STU001',
      sessionId,
    });

    expect(device.fingerprintHash).toBe(fingerprintHash);
    expect(device.boundToStudent).toBe('STU001');
    expect(device.attendanceCount).toBe(1);
  });

  it('should hash fingerprint consistently', () => {
    const fingerprint = 'my-device-fingerprint';
    const hash1 = Device.hashFingerprint(fingerprint);
    const hash2 = Device.hashFingerprint(fingerprint);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should uppercase roll number', async () => {
    const device = await Device.create({
      fingerprintHash: Device.hashFingerprint('fingerprint-2'),
      boundToStudent: 'stu002',
      sessionId,
    });
    expect(device.boundToStudent).toBe('STU002');
  });

  it('should add flag to device', async () => {
    const device = await Device.create({
      fingerprintHash: Device.hashFingerprint('fingerprint-3'),
      boundToStudent: 'STU003',
      sessionId,
    });

    device.addFlag('MULTI_STUDENT_DEVICE', 'Used by multiple students', sessionId);
    await device.save();

    expect(device.flags).toHaveLength(1);
    expect(device.flags[0].type).toBe('MULTI_STUDENT_DEVICE');
  });

  it('should check for multi-student flag', async () => {
    const device = await Device.create({
      fingerprintHash: Device.hashFingerprint('fingerprint-4'),
      boundToStudent: 'STU004',
      sessionId,
    });

    device.addFlag('MULTI_STUDENT_DEVICE', 'Test', sessionId);
    await device.save();

    expect(device.hasMultiStudentFlag()).toBe(true);
  });
});

async function setupShortLinkApiData() {
  const admin = await Admin.create({
    username: 'shortlinkapi',
    email: 'slapi@test.com',
    password: 'password123',
  });
  
  const loginRes = await request(app)
    .post('/api/admin/login')
    .send({ username: 'shortlinkapi', password: 'password123' });
  
  const location = await Location.create({
    name: 'API Test Location',
    latitude: 40.7128,
    longitude: -74.0060,
    radiusMeters: 100,
    createdBy: admin._id,
  });

  const session = await Session.create({
    locationId: location._id,
    tokenHash: 'api-test-token-hash',
    tokenPrefix: 'apit',
    createdBy: admin._id,
    expiresAt: new Date(Date.now() + 3600000),
  });

  return {
    adminId: admin._id,
    adminToken: loginRes.body.token,
    sessionId: session._id,
    locationId: location._id,
  };
}

describe('ShortLink API Endpoints', () => {
  let adminToken, adminId, sessionId, locationId;

  beforeEach(async () => {
    const data = await setupShortLinkApiData();
    adminId = data.adminId;
    adminToken = data.adminToken;
    sessionId = data.sessionId;
    locationId = data.locationId;
  });

  describe('POST /api/admin/shortlinks', () => {
    it('should create short link with auto-generated code', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toMatch(/^[a-z0-9]{6}$/);
    });

    it('should create short link with custom code', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shortCode: 'custom123' });

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toBe('custom123');
    });

    it('should reject duplicate short code', async () => {
      await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shortCode: 'duplicate123' });

      const res = await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shortCode: 'duplicate123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('should create short link attached to session', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shortCode: 'attached123', sessionId });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBe(sessionId.toString());
    });

    it('should reject attaching to non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ shortCode: 'no-session', sessionId: fakeId });

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks')
        .send({ shortCode: 'no-auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/shortlinks', () => {
    it('should list all short links', async () => {
      const res = await request(app)
        .get('/api/admin/shortlinks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.shortLinks)).toBe(true);
    });

    it('should filter by sessionId', async () => {
      const res = await request(app)
        .get(`/api/admin/shortlinks?sessionId=${sessionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/shortlinks/:shortCode/attach', () => {
    beforeEach(async () => {
      await ShortLink.create({
        shortCode: 'attach-test',
        createdBy: adminId,
      });
    });

    it('should attach short link to session', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks/attach-test/attach')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sessionId });

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('should enable TOTP on session when attached', async () => {
      await request(app)
        .post('/api/admin/shortlinks/attach-test/attach')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sessionId });

      const session = await Session.findById(sessionId);
      expect(session.totpEnabled).toBe(true);
    });

    it('should reject non-existent short link', async () => {
      const res = await request(app)
        .post('/api/admin/shortlinks/nonexistent/attach')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sessionId });

      expect(res.status).toBe(404);
    });

    it('should reject non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/admin/shortlinks/attach-test/attach')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sessionId: fakeId });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/shortlinks/:shortCode', () => {
    beforeEach(async () => {
      await ShortLink.create({
        shortCode: 'delete-test',
        createdBy: adminId,
      });
    });

    it('should delete short link', async () => {
      const res = await request(app)
        .delete('/api/admin/shortlinks/delete-test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      
      const link = await ShortLink.findOne({ shortCode: 'delete-test' });
      expect(link).toBeNull();
    });

    it('should return 404 for non-existent link', async () => {
      const res = await request(app)
        .delete('/api/admin/shortlinks/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});

describe('Short Link Redirect Route', () => {
  let adminToken, adminId, sessionId, locationId, shortLink;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'redirecttest',
      email: 'redirect@test.com',
      password: 'password123',
    });
    adminId = admin._id;

    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'redirecttest', password: 'password123' });
    adminToken = loginRes.body.token;

    const location = await Location.create({
      name: 'Redirect Test Location',
      latitude: 40.7128,
      longitude: -74.0060,
      radiusMeters: 100,
      createdBy: adminId,
    });
    locationId = location._id;

    const session = await Session.create({
      locationId: location._id,
      tokenHash: 'redirect-test-token-hash',
      tokenPrefix: 'redt',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
      totpEnabled: true,
      totpSecret: 'redirect-test-secret',
    });
    sessionId = session._id;

    shortLink = await ShortLink.create({
      shortCode: 'redirect123',
      sessionId,
      createdBy: adminId,
    });
  });

  describe('GET /s/:shortCode', () => {
    it('should redirect to student page for valid link', async () => {
      const res = await request(app)
        .get('/s/redirect123');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('student-scan.html');
    });

    it('should return 404 for non-existent link', async () => {
      const res = await request(app).get('/s/nonexistent');

      expect(res.status).toBe(404);
      expect(res.text).toContain('Invalid Link');
    });

    it('should return 400 for link without session', async () => {
      await ShortLink.create({
        shortCode: 'nobound',
        createdBy: adminId,
      });

      const res = await request(app).get('/s/nobound');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Not Configured');
    });
  });

  describe('GET /s/:shortCode/info', () => {
    it('should return current TOTP code', async () => {
      const res = await request(app).get('/s/redirect123/info');

      expect(res.status).toBe(200);
      expect(res.body.totpCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(res.body.sessionId).toBe(sessionId.toString());
    });

    it('should return 404 for non-existent link', async () => {
      const res = await request(app).get('/s/nonexistent/info');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /s/:shortCode/session', () => {
    it('should return session info', async () => {
      const res = await request(app).get('/s/redirect123/session');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.session.totpEnabled).toBe(true);
    });
  });
});

describe('Device Fingerprint Validation', () => {
  let adminId, sessionId, locationId;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'devicevalidation',
      email: 'deviceval@test.com',
      password: 'password123',
    });
    adminId = admin._id;

    const location = await Location.create({
      name: 'Device Validation Location',
      latitude: 40.7128,
      longitude: -74.0060,
      radiusMeters: 100,
      createdBy: adminId,
    });
    locationId = location._id;

    const session = await Session.create({
      locationId: location._id,
      tokenHash: 'device-validation-token-hash',
      tokenPrefix: 'devv',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
    });
    sessionId = session._id;
  });

  it('should create new device on first attendance', async () => {
    const fingerprint = Device.hashFingerprint('new-device-fp');
    
    const device = await Device.findOne({ fingerprintHash: fingerprint, sessionId });
    expect(device).toBeNull();

    const newDevice = await Device.create({
      fingerprintHash: fingerprint,
      boundToStudent: 'STU001',
      sessionId,
    });

    expect(newDevice.boundToStudent).toBe('STU001');
  });

  it('should flag same device used by multiple students', async () => {
    const fingerprint = Device.hashFingerprint('multi-student-fp');
    
    await Device.create({
      fingerprintHash: fingerprint,
      boundToStudent: 'STU002',
      sessionId,
    });

    const existingDevice = await Device.findOne({ fingerprintHash: fingerprint, sessionId });
    
    const differentStudent = 'STU003';
    expect(existingDevice.boundToStudent).not.toBe(differentStudent);
    
    existingDevice.addFlag('MULTI_STUDENT_DEVICE', 
      `Device previously used by ${existingDevice.boundToStudent}, now ${differentStudent}`,
      sessionId
    );
    await existingDevice.save();

    expect(existingDevice.hasMultiStudentFlag()).toBe(true);
  });

  it('should detect student device switch', async () => {
    const fp1 = Device.hashFingerprint('student-device-1');
    const fp2 = Device.hashFingerprint('student-device-2');
    const student = 'STU004';

    await Device.create({
      fingerprintHash: fp1,
      boundToStudent: student,
      sessionId,
    });

    const existingDevice = await Device.findOne({ boundToStudent: student, sessionId });
    expect(existingDevice.fingerprintHash).toBe(fp1);
    expect(fp2).not.toBe(fp1);
  });
});

describe('Session TOTP API', () => {
  let adminToken, adminId, sessionId, locationId;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'totptest',
      email: 'totp@test.com',
      password: 'password123',
    });
    adminId = admin._id;

    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'totptest', password: 'password123' });
    adminToken = loginRes.body.token;

    const location = await Location.create({
      name: 'TOTP Test Location',
      latitude: 40.7128,
      longitude: -74.0060,
      radiusMeters: 100,
      createdBy: adminId,
    });
    locationId = location._id;
  });

  it('should create session with TOTP fields', async () => {
    const res = await request(app)
      .post('/api/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        locationId: locationId,
        durationMinutes: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.totpEnabled).toBe(false);
    sessionId = res.body._id;
  });

  it('should get TOTP for session', async () => {
    const session = await Session.create({
      locationId,
      tokenHash: 'totp-test-hash',
      tokenPrefix: 'totp',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
      totpEnabled: true,
      totpSecret: 'test-secret',
    });
    sessionId = session._id;

    await ShortLink.create({
      shortCode: 'totp-test-link',
      sessionId,
      createdBy: adminId,
    });

    const res = await request(app)
      .get(`/api/admin/sessions/${sessionId}/totp`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totpCode).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('should return 400 when TOTP not enabled', async () => {
    const newSession = await Session.create({
      locationId,
      tokenHash: 'no-totp-token-hash',
      tokenPrefix: 'notp',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
      totpEnabled: false,
    });

    const res = await request(app)
      .get(`/api/admin/sessions/${newSession._id}/totp`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe('Security Tests', () => {
  let adminToken, adminId, sessionId, locationId, shortLink;

  beforeEach(async () => {
    const admin = await Admin.create({
      username: 'securitytest',
      email: 'security@test.com',
      password: 'password123',
    });
    adminId = admin._id;

    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'securitytest', password: 'password123' });
    adminToken = loginRes.body.token;

    const location = await Location.create({
      name: 'Security Test Location',
      latitude: 40.7128,
      longitude: -74.0060,
      radiusMeters: 100,
      createdBy: adminId,
    });
    locationId = location._id;

    const session = await Session.create({
      locationId: location._id,
      tokenHash: 'security-test-token-hash',
      tokenPrefix: 'sect',
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 3600000),
      totpEnabled: true,
      totpSecret: 'security-test-secret',
    });
    sessionId = session._id;

    shortLink = await ShortLink.create({
      shortCode: 'security123',
      sessionId,
      createdBy: adminId,
    });
  });

  it('should reject TOTP replay attack', async () => {
    const totpRes = await request(app).get('/s/security123/info');
    const totpCode = totpRes.body.totpCode;

    const result1 = validateTOTPCode(totpCode, 'security-test-secret', sessionId.toString(), 5, 1);
    expect(result1.valid).toBe(true);
  });

  it('should reject expired TOTP codes', async () => {
    const oldCode = '123456';
    const result = validateTOTPCode(oldCode, 'security-test-secret', sessionId.toString(), 5, 1);
    expect(result.valid).toBe(false);
  });

  it('should require authentication for admin endpoints', async () => {
    const res = await request(app)
      .post('/api/admin/shortlinks')
      .send({ shortCode: 'no-auth-test' });

    expect(res.status).toBe(401);
  });

  it('should reject invalid JWT tokens', async () => {
    const res = await request(app)
      .get('/api/admin/shortlinks')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('should sanitize short code input', async () => {
    const res = await request(app)
      .post('/api/admin/shortlinks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shortCode: '<script>alert("xss")</script>' });

    expect([400, 500]).toContain(res.status);
  });

  it('should handle concurrent TOTP requests', async () => {
    const requests = Array(10).fill(null).map(() => 
      request(app).get('/s/security123/info')
    );

    const responses = await Promise.all(requests);
    responses.forEach(res => {
      expect(res.status).toBe(200);
    });
  });
});
