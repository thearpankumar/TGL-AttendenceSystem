const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');
const Location = require('../src/models/Location');
const Session = require('../src/models/Session');
const Attendance = require('../src/models/Attendance');

beforeAll(() => {
  process.env.STORAGE_PROVIDER = 'cloudinary';
  process.env.CLOUDINARY_CLOUD_NAME = 'test';
  process.env.CLOUDINARY_API_KEY = 'test';
  process.env.CLOUDINARY_API_SECRET = 'test';
});

describe('Attendance Model Edge Cases', () => {
  let admin, location, session;
  
  beforeEach(async () => {
    admin = await Admin.create({
      username: 'testadmin',
      email: 'admin@test.com',
      password: 'password123'
    });
    
    location = await Location.create({
      name: 'Test Location',
      latitude: 12.9715987,
      longitude: 77.5945627,
      radiusMeters: 100,
      createdBy: admin._id
    });
    
    const token = Session.generateToken();
    session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
  });
  
  describe('Roll Number Handling', () => {
    test('should uppercase roll number on save', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
        rollNumber: '21cs101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.rollNumber).toBe('21CS101');
    });
    
    test('should accept numeric-only roll numbers', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Number Student',
        rollNumber: '12345678',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.rollNumber).toBe('12345678');
    });
    
    test('should accept mixed roll numbers', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Mixed Student',
        rollNumber: '21CS1A001',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.rollNumber).toBe('21CS1A001');
    });
  });
  
  describe('Duplicate Prevention', () => {
    test('should prevent duplicate roll number in same session', async () => {
      await Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      await expect(
        Attendance.create({
          sessionId: session._id,
          studentName: 'Jane Doe',
          rollNumber: '21CS101',
          photoUrl: 'https://example.com/photo2.jpg',
          photoPublicId: 'photo124',
          studentLatitude: 12.972,
          studentLongitude: 77.595,
          distanceFromLocation: 60,
          verified: true
        })
      ).rejects.toThrow();
    });
    
    test('should allow same roll number in different sessions', async () => {
      await Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      const token2 = Session.generateToken();
      const session2 = await Session.create({
        locationId: location._id,
        tokenHash: Session.hashToken(token2),
        tokenPrefix: token2.substring(0, 4),
        createdBy: admin._id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      
      const attendance2 = await Attendance.create({
        sessionId: session2._id,
        studentName: 'John Doe',
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo2.jpg',
        photoPublicId: 'photo124',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance2.rollNumber).toBe('21CS101');
    });
  });
  
  describe('Student Name Handling', () => {
    test('should handle special characters in name', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: "John O'Brien-Smith Jr.",
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.studentName).toBe("John O'Brien-Smith Jr.");
    });
    
    test('should handle very long names (up to 100 chars)', async () => {
      const longName = 'A'.repeat(100);
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: longName,
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.studentName).toHaveLength(100);
    });
    
    test('should reject names shorter than 2 characters', async () => {
      await expect(
        Attendance.create({
          sessionId: session._id,
          studentName: 'J',
          rollNumber: '21CS101',
          photoUrl: 'https://example.com/photo.jpg',
          photoPublicId: 'photo123',
          studentLatitude: 12.971,
          studentLongitude: 77.594,
          distanceFromLocation: 50,
          verified: true
        })
      ).rejects.toThrow();
    });
  });
  
  describe('Coordinate Validation', () => {
    test('should accept coordinates at exact boundaries', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Boundary Test',
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo123',
        studentLatitude: 90,
        studentLongitude: 180,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.studentLatitude).toBe(90);
      expect(attendance.studentLongitude).toBe(180);
    });
    
    test('should accept coordinates at negative boundaries', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Boundary Test',
        rollNumber: '21CS102',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo124',
        studentLatitude: -90,
        studentLongitude: -180,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.studentLatitude).toBe(-90);
      expect(attendance.studentLongitude).toBe(-180);
    });
    
    test('should reject latitude > 90', async () => {
      await expect(
        Attendance.create({
          sessionId: session._id,
          studentName: 'Invalid Test',
          rollNumber: '21CS103',
          photoUrl: 'https://example.com/photo.jpg',
          photoPublicId: 'photo125',
          studentLatitude: 91,
          studentLongitude: 77.594,
          distanceFromLocation: 50,
          verified: true
        })
      ).rejects.toThrow();
    });
    
    test('should reject longitude > 180', async () => {
      await expect(
        Attendance.create({
          sessionId: session._id,
          studentName: 'Invalid Test',
          rollNumber: '21CS104',
          photoUrl: 'https://example.com/photo.jpg',
          photoPublicId: 'photo126',
          studentLatitude: 12.971,
          studentLongitude: 181,
          distanceFromLocation: 50,
          verified: true
        })
      ).rejects.toThrow();
    });
    
    test('should handle coordinates at 0,0 (Null Island)', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Null Island Test',
        rollNumber: '21CS105',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo127',
        studentLatitude: 0,
        studentLongitude: 0,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.studentLatitude).toBe(0);
      expect(attendance.studentLongitude).toBe(0);
    });
  });
  
  describe('Verification Status', () => {
    test('should store verified status correctly', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Verified Test',
        rollNumber: '21CS106',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo128',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.verified).toBe(true);
    });
    
    test('should store unverified status correctly', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Unverified Test',
        rollNumber: '21CS107',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo129',
        studentLatitude: 12.980,
        studentLongitude: 77.600,
        distanceFromLocation: 1500,
        verified: false
      });
      
      expect(attendance.verified).toBe(false);
    });
  });

  describe('Face Detection Status', () => {
    test('should default faceDetected to true', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Face Default Test',
        rollNumber: '21CS108',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo130',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.faceDetected).toBe(true);
    });

    test('should store faceDetected as false when passed', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Face False Test',
        rollNumber: '21CS109',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo131',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true,
        faceDetected: false
      });
      
      expect(attendance.faceDetected).toBe(false);
    });
  });
  
  describe('Distance Handling', () => {
    test('should store distance correctly', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Distance Test',
        rollNumber: '21CS108',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo130',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.distanceFromLocation).toBe(50);
    });
    
    test('should handle large distances', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Far Away Test',
        rollNumber: '21CS109',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo131',
        studentLatitude: 28.7041,
        studentLongitude: 77.1025,
        distanceFromLocation: 1750000,
        verified: false
      });
      
      expect(attendance.distanceFromLocation).toBe(1750000);
    });
    
    test('should handle zero distance', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Exact Location Test',
        rollNumber: '21CS110',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo132',
        studentLatitude: location.latitude,
        studentLongitude: location.longitude,
        distanceFromLocation: 0,
        verified: true
      });
      
      expect(attendance.distanceFromLocation).toBe(0);
    });
  });

  describe('Network Provider and Org Handling', () => {
    test('should store networkProvider and networkOrg correctly', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Network Student',
        rollNumber: '21CS112',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo134',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true,
        networkProvider: 'Reliance Jio Infocomm',
        networkOrg: 'Jio'
      });
      
      expect(attendance.networkProvider).toBe('Reliance Jio Infocomm');
      expect(attendance.networkOrg).toBe('Jio');
    });

    test('should default networkProvider and networkOrg to undefined/not present if omitted', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'No Network Info Student',
        rollNumber: '21CS113',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo135',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.networkProvider).toBeUndefined();
      expect(attendance.networkOrg).toBeUndefined();
    });
  });
  
  describe('Timestamp Handling', () => {
    test('should auto-generate capturedAt timestamp', async () => {
      const beforeCreate = new Date();
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Timestamp Test',
        rollNumber: '21CS111',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo133',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      const afterCreate = new Date();
      
      expect(attendance.capturedAt).toBeDefined();
      expect(attendance.capturedAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
      expect(attendance.capturedAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime() + 1000);
    });
  });
  describe('DEV Bypass Audit Logging', () => {
    test('should store bypass flags correctly', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Bypass Student',
        rollNumber: '21CS114',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo136',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 0,
        verified: true,
        flagged: true,
        flagReason: 'DEV_BYPASS_ENABLED',
        flagDetails: 'Camera:true, GPS:false, WebAuthn:true'
      });
      
      expect(attendance.flagged).toBe(true);
      expect(attendance.flagReason).toBe('DEV_BYPASS_ENABLED');
      expect(attendance.flagDetails).toBe('Camera:true, GPS:false, WebAuthn:true');
    });

    test('should default flagged to false', async () => {
      const attendance = await Attendance.create({
        sessionId: session._id,
        studentName: 'Normal Student',
        rollNumber: '21CS115',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo137',
        studentLatitude: 12.971,
        studentLongitude: 77.594,
        distanceFromLocation: 50,
        verified: true
      });
      
      expect(attendance.flagged).toBe(false);
      expect(attendance.flagReason).toBeNull();
      expect(attendance.flagDetails).toBeNull();
    });
  });
});

describe('Session Expiry Tests', () => {
  let admin, location;
  
  beforeEach(async () => {
    await Admin.deleteMany({});
    await Location.deleteMany({});
    await Session.deleteMany({});
    
    admin = await Admin.create({
      username: 'testadmin',
      email: 'admin@test.com',
      password: 'password123'
    });
    
    location = await Location.create({
      name: 'Test Location',
      latitude: 12.971,
      longitude: 77.594,
      radiusMeters: 100,
      createdBy: admin._id
    });
  });
  
  test('should create session with future expiry', async () => {
    const token = Session.generateToken();
    const session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  
  test('should allow expired session to exist in DB', async () => {
    const token = Session.generateToken();
    const session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() - 1000)
    });
    
    expect(session.expiresAt.getTime()).toBeLessThan(Date.now());
  });
  
  test('should set isActive to true by default', async () => {
    const token = Session.generateToken();
    const session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    
    expect(session.isActive).toBe(true);
  });
  
  test('should allow setting isActive to false', async () => {
    const token = Session.generateToken();
    const session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isActive: false
    });
    
    expect(session.isActive).toBe(false);
  });
});
