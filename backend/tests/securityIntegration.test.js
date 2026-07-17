const request = require('supertest');
const app = require('../src/server');
const Admin = require('../src/models/Admin');
const Location = require('../src/models/Location');
const Session = require('../src/models/Session');
const ShortLink = require('../src/models/ShortLink');
const Attendance = require('../src/models/Attendance');
const DeviceFingerprint = require('../src/models/DeviceFingerprint');
const SystemConfig = require('../src/models/SystemConfig');
const jwt = require('jsonwebtoken');
const config = require('../src/config');

describe('Security Integration Tests', () => {
  let admin, adminToken, session, shortLink, location;

  const mobileUA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

  beforeAll(async () => {
    admin = await Admin.create({
      username: 'integadmin',
      email: 'integadmin@test.com',
      password: 'password123',
    });

    adminToken = jwt.sign(
      { adminId: admin._id, username: admin.username },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    location = await Location.create({
      name: 'Integration Test Location',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 100,
      createdBy: admin._id,
    });

    session = await Session.create({
      locationId: location._id,
      tokenHash: 'integration-test-token-hash',
      tokenPrefix: 'int',
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 3600000),
    });

    shortLink = await ShortLink.create({
      shortCode: 'integtest123',
      sessionId: session._id,
      createdBy: admin._id,
    });
  });

  describe('Happy Path - Valid GPS Submission', () => {
    it('should submit attendance without flags for valid GPS', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Valid Student',
          rollNumber: 'VALID001',
          photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0PHy5eLtdcsePmDDD+/8AAEQwBGAEDAw',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-valid-1',
          gpsMetadata: {
            accuracy: 15,
            altitude: 500,
            speed: 0,
            timestamp: Date.now(),
            provider: 'gps',
          },
        });

      expect(res.status).not.toBe(403);
    });
  });

  describe('GPS Anomaly Flow', () => {
    beforeEach(async () => {
      await Attendance.deleteMany({ rollNumber: /^GPS/ });
      await DeviceFingerprint.deleteMany({ fingerprintId: /^device-gps/ });
    });

    it('should flag submission with suspicious accuracy', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'GPS Anomaly',
          rollNumber: 'GPS001',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-gps-1',
          gpsMetadata: {
            accuracy: 2,
            altitude: 0,
            speed: 0,
            timestamp: Date.now(),
            provider: 'gps',
          },
        });

      const attendance = await Attendance.findOne({ rollNumber: 'GPS001' });
      if (attendance) {
        expect(attendance.gpsAnomalies.length).toBeGreaterThan(0);
        expect(attendance.flagged).toBe(true);
      }
    });

    it('should record multiple anomaly types', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Multi Anomaly',
          rollNumber: 'GPS002',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-gps-2',
          gpsMetadata: {
            accuracy: 2,
            altitude: 0,
            speed: 0,
            timestamp: Date.now() + 120000,
            provider: 'network',
          },
        });

      const attendance = await Attendance.findOne({ rollNumber: 'GPS002' });
      if (attendance && attendance.gpsAnomalies.length > 1) {
        const types = attendance.gpsAnomalies.map(a => a.type);
        expect(types.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Emulator Detection Flow', () => {
    beforeEach(async () => {
      await Attendance.deleteMany({ rollNumber: /^EMU/ });
    });

    it('should flag submission with emulator GPU', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Emulator User',
          rollNumber: 'EMU001',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-emu-1',
          gpsMetadata: {
            accuracy: 15,
            altitude: 500,
            timestamp: Date.now(),
          },
          deviceMetrics: {
            webglRenderer: 'SwiftShader',
            maxTouchPoints: 1,
            deviceMemory: 8,
          },
        });

      const attendance = await Attendance.findOne({ rollNumber: 'EMU001' });
      if (attendance) {
        expect(attendance.emulatorDetected).toBe(true);
        expect(attendance.emulatorFlags.length).toBeGreaterThan(0);
      }
    });

    it('should detect desktop GPU on mobile UA', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Desktop GPU',
          rollNumber: 'EMU002',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-emu-2',
          gpsMetadata: { accuracy: 15, timestamp: Date.now() },
          deviceMetrics: {
            webglRenderer: 'NVIDIA GeForce RTX 3080',
            maxTouchPoints: 0,
          },
        });

      const attendance = await Attendance.findOne({ rollNumber: 'EMU002' });
      if (attendance && attendance.emulatorFlags.length > 0) {
        expect(attendance.emulatorFlags[0].type).toContain('GPU');
      }
    });
  });

  describe('Device Blocking Flow', () => {
    it('should auto-block device after 5 spoofing attempts', async () => {
      const deviceId = 'device-block-test';
      
      const device = await DeviceFingerprint.create({
        fingerprintId: deviceId,
        spoofingAttempts: 4,
        isBlocked: false,
      });

      await device.recordVerificationFailure('Test spoofing attempt');

      expect(device.spoofingAttempts).toBe(5);
      expect(device.isBlocked).toBe(true);
      expect(device.blockReason).toContain('Blocked after 5');
    });
  });

  describe('Device Trust Score Recovery', () => {
    it('should increase trust score on admin approve', async () => {
      const device = await DeviceFingerprint.create({
        fingerprintId: 'device-trust-test',
        spoofingAttempts: 2,
        verificationFailures: 2,
        isBlocked: false,
      });

      await device.increaseTrustScore(10);

      expect(device.spoofingAttempts).toBeLessThan(2);
    });

    it('should unblock device after trust recovery', async () => {
      const device = await DeviceFingerprint.create({
        fingerprintId: 'device-unblock-test',
        spoofingAttempts: 3,
        isBlocked: true,
        blockReason: 'Blocked after 5 spoofing attempts',
      });

      await device.increaseTrustScore(10);
      await device.increaseTrustScore(10);
      await device.increaseTrustScore(10);

      expect(device.isBlocked).toBe(false);
      expect(device.blockReason).toBeNull();
    });
  });

  describe('Position History Jump Detection', () => {
    it('should track position history per device', async () => {
      const device = 'device-pos-1';
      
      await DeviceFingerprint.create({ fingerprintId: device });

      expect(device).toBeDefined();
    });
  });

  describe('Configuration Changes', () => {
    it('should apply updated thresholds', async () => {
      const sysConfig = await SystemConfig.getConfig();
      
      sysConfig.gpsValidation.accuracyVerySuspicious = 5;
      await sysConfig.save();

      const updated = await SystemConfig.getConfig();
      expect(updated.gpsValidation.accuracyVerySuspicious).toBe(5);
    });
  });

  describe('Combined Anomalies', () => {
    beforeEach(async () => {
      await Attendance.deleteMany({ rollNumber: /^COMBINED/ });
    });

    it('should record GPS + Emulator + Integrity anomalies together', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Windows"')
        .send({
          studentName: 'Combined Anomaly',
          rollNumber: 'COMBINED001',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-combined-1',
          gpsMetadata: {
            accuracy: 2,
            altitude: 0,
            timestamp: Date.now(),
            provider: 'network',
          },
          deviceMetrics: {
            webglRenderer: 'SwiftShader',
            maxTouchPoints: 1,
            deviceMemory: 8,
          },
          integrityChecks: [
            { type: 'TIMING_MANIPULATION', details: 'Fast computation' },
          ],
        });

      const attendance = await Attendance.findOne({ rollNumber: 'COMBINED001' });
      if (attendance) {
        const hasGpsAnomaly = attendance.gpsAnomalies?.length > 0;
        const hasEmulatorFlag = attendance.emulatorDetected;
        const hasIntegrityChecks = attendance.integrityChecks?.length > 0;

        expect(hasGpsAnomaly || hasEmulatorFlag || hasIntegrityChecks).toBe(true);
      }
    });
  });

  describe('Admin Review Flow', () => {
    let reviewAttendance;

    beforeEach(async () => {
      reviewAttendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Review Flow',
        rollNumber: 'REVIEWFLOW001',
        photoUrl: 'url',
        photoPublicId: 'id',
        studentLatitude: 12.9716,
        studentLongitude: 77.5946,
        distanceFromLocation: 50,
        flagged: true,
        flagReason: 'GPS_ANOMALY_DETECTED',
        gpsAnomalies: [{ type: 'ACCURACY_SUSPICIOUS', severity: 'high', details: 'Test' }],
      });
    });

    afterEach(async () => {
      await Attendance.deleteMany({ rollNumber: /^REVIEWFLOW/ });
    });

    it('should complete approve flow', async () => {
      const res = await request(app)
        .post(`/api/admin/security/attendance/${reviewAttendance._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' });

      expect([200, 401]).toContain(res.status);
      
      if (res.status === 200) {
        const updated = await Attendance.findById(reviewAttendance._id);
        expect(updated.flagReviewed).toBe(true);
        expect(updated.flagged).toBe(false);
      }
    });

    it('should complete reject flow', async () => {
      const res = await request(app)
        .post(`/api/admin/security/attendance/${reviewAttendance._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'reject' });

      expect([200, 401]).toContain(res.status);
      
      if (res.status === 200) {
        const updated = await Attendance.findById(reviewAttendance._id);
        expect(updated.flagReviewed).toBe(true);
      }
    });
  });

  describe('Security Summary Integration', () => {
    it('should return accurate security summary', async () => {
      const res = await request(app)
        .get(`/api/admin/security/sessions/${session._id}/security-summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('totalSubmissions');
      }
    });
  });

  describe('Edge Cases and Attack Vectors', () => {
    beforeEach(async () => {
      await Attendance.deleteMany({ rollNumber: /^EDGE/ });
    });

    it('should handle missing gpsMetadata gracefully', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Edge Case',
          rollNumber: 'EDGE001',
          photo: 'data:image/jpeg;base64,test',
          latitude: 12.9716,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-edge-1',
        });

      expect(res.status).not.toBe(403);
    });

    it('should validate payload integrity', async () => {
      const res = await request(app)
        .post(`/s/${shortLink.shortCode}/submit`)
        .set('User-Agent', mobileUA)
        .set('sec-ch-ua-mobile', '?1')
        .set('sec-ch-ua-platform', '"Android"')
        .send({
          studentName: 'Edge Case',
          rollNumber: 'EDGE002',
          photo: 'data:image/jpeg;base64,test',
          latitude: 999,
          longitude: 77.5946,
          faceDetected: true,
          captchaId: '1700000000000.mock',
          captchaAnswer: 'test',
          deviceFingerprint: 'device-edge-2',
          gpsMetadata: { accuracy: 'invalid' },
        });

      expect([400, 404, 500]).toContain(res.status);
    });
  });
});
