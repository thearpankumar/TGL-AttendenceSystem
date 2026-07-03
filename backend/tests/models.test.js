const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');
const Location = require('../src/models/Location');
const Session = require('../src/models/Session');
const Attendance = require('../src/models/Attendance');

describe('Admin Model', () => {
  test('should create admin with hashed password', async () => {
    const admin = await Admin.create({
      username: 'testadmin',
      email: 'admin@test.com',
      password: 'password123',
    });

    expect(admin.username).toBe('testadmin');
    expect(admin.password).not.toBe('password123');
    expect(admin.password).toHaveLength(60);
  });

  test('should match password correctly', async () => {
    const admin = await Admin.create({
      username: 'testadmin',
      email: 'admin@test.com',
      password: 'password123',
    });

    const isMatch = await admin.matchPassword('password123');
    expect(isMatch).toBe(true);

    const isWrongMatch = await admin.matchPassword('wrongpassword');
    expect(isWrongMatch).toBe(false);
  });

  test('should fail validation for duplicate username', async () => {
    await Admin.create({
      username: 'testadmin',
      email: 'admin1@test.com',
      password: 'password123',
    });

    await expect(
      Admin.create({
        username: 'testadmin',
        email: 'admin2@test.com',
        password: 'password123',
      })
    ).rejects.toThrow();
  });

  test('should fail validation for duplicate email', async () => {
    await Admin.create({
      username: 'admin1',
      email: 'admin@test.com',
      password: 'password123',
    });

    await expect(
      Admin.create({
        username: 'admin2',
        email: 'admin@test.com',
        password: 'password123',
      })
    ).rejects.toThrow();
  });

  test('should fail validation for short password (< 6 chars)', async () => {
    await expect(
      Admin.create({
        username: 'testadmin',
        email: 'admin@test.com',
        password: '12345',
      })
    ).rejects.toThrow();
  });

  test('should fail validation for short username (< 3 chars)', async () => {
    await expect(
      Admin.create({
        username: 'ab',
        email: 'admin@test.com',
        password: 'password123',
      })
    ).rejects.toThrow();
  });

  test('should normalize email to lowercase', async () => {
    const admin = await Admin.create({
      username: 'testadmin',
      email: 'ADMIN@TEST.COM',
      password: 'password123',
    });
    expect(admin.email).toBe('admin@test.com');
  });
});

describe('Location Model', () => {
  let admin;

  beforeEach(async () => {
    admin = await Admin.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'password123',
    });
  });

  test('should create location successfully', async () => {
    const location = await Location.create({
      name: 'Test Location',
      latitude: 12.9715987,
      longitude: 77.5945627,
      radiusMeters: 100,
      createdBy: admin._id,
    });

    expect(location.name).toBe('Test Location');
    expect(location.latitude).toBe(12.9715987);
    expect(location.longitude).toBe(77.5945627);
    expect(location.radiusMeters).toBe(100);
    expect(location.isActive).toBe(true);
  });

  test('should fail for invalid latitude > 90', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: 200,
        longitude: 77.594,
        radiusMeters: 100,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for invalid latitude < -90', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: -91,
        longitude: 77.594,
        radiusMeters: 100,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for invalid longitude > 180', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: 12.971,
        longitude: 181,
        radiusMeters: 100,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for invalid longitude < -180', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: 12.971,
        longitude: -181,
        radiusMeters: 100,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for radius < 10', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: 12.971,
        longitude: 77.594,
        radiusMeters: 5,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for radius > 10000', async () => {
    await expect(
      Location.create({
        name: 'Test',
        latitude: 12.971,
        longitude: 77.594,
        radiusMeters: 15000,
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });

  test('should fail for missing required fields', async () => {
    await expect(
      Location.create({
        name: 'Test',
      })
    ).rejects.toThrow();
  });

  test('should accept valid coordinates at boundaries', async () => {
    const location = await Location.create({
      name: 'North Pole',
      latitude: 90,
      longitude: 0,
      radiusMeters: 100,
      createdBy: admin._id,
    });
    expect(location.latitude).toBe(90);
  });
});

describe('Session Model', () => {
  let admin, location;

  beforeEach(async () => {
    admin = await Admin.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'password123',
    });

    location = await Location.create({
      name: 'Test Location',
      latitude: 12.9715987,
      longitude: 77.5945627,
      radiusMeters: 100,
      createdBy: admin._id,
    });
  });

  test('should create session with token hash', async () => {
    const token = Session.generateToken();
    const tokenHash = Session.hashToken(token);

    const session = await Session.create({
      locationId: location._id,
      tokenHash,
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    expect(session.tokenHash).toBe(tokenHash);
    expect(session.tokenPrefix).toBe(token.substring(0, 4));
    expect(session.isActive).toBe(true);
    expect(session.rotationCount).toBe(0);
  });

  test('should reject duplicate tokenHash', async () => {
    const token = Session.generateToken();
    const tokenHash = Session.hashToken(token);

    await Session.create({
      locationId: location._id,
      tokenHash,
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    await expect(
      Session.create({
        locationId: location._id,
        tokenHash,
        tokenPrefix: token.substring(0, 4),
        createdBy: admin._id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
    ).rejects.toThrow();
  });

  test('should store boolean isActive correctly', async () => {
    const token = Session.generateToken();
    const session = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token),
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isActive: false,
    });

    expect(session.isActive).toBe(false);
  });

  test('should require expiresAt field', async () => {
    const token = Session.generateToken();
    await expect(
      Session.create({
        locationId: location._id,
        tokenHash: Session.hashToken(token),
        tokenPrefix: token.substring(0, 4),
        createdBy: admin._id,
      })
    ).rejects.toThrow();
  });
});

describe('Attendance Model', () => {
  let admin, location, session;

  beforeEach(async () => {
    admin = await Admin.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'password123',
    });

    location = await Location.create({
      name: 'Test Location',
      latitude: 12.9715987,
      longitude: 77.5945627,
      radiusMeters: 100,
      createdBy: admin._id,
    });

    const token = Session.generateToken();
    const tokenHash = Session.hashToken(token);

    session = await Session.create({
      locationId: location._id,
      tokenHash,
      tokenPrefix: token.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  });

  test('should create attendance record', async () => {
    const attendance = await Attendance.create({
      sessionId: session._id,
      studentName: 'John Doe',
      rollNumber: '21CS101',
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo123',
      studentLatitude: 12.9715987,
      studentLongitude: 77.5945627,
      distanceFromLocation: 50,
      verified: true,
    });

    expect(attendance.studentName).toBe('John Doe');
    expect(attendance.rollNumber).toBe('21CS101');
    expect(attendance.verified).toBe(true);
  });

  test('should prevent duplicate roll numbers in same session', async () => {
    await Attendance.create({
      sessionId: session._id,
      studentName: 'John Doe',
      rollNumber: '21CS101',
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo123',
      studentLatitude: 12.9715987,
      studentLongitude: 77.5945627,
      distanceFromLocation: 50,
      verified: true,
    });

    await expect(
      Attendance.create({
        sessionId: session._id,
        studentName: 'Jane Doe',
        rollNumber: '21CS101',
        photoUrl: 'https://example.com/photo2.jpg',
        photoPublicId: 'photo124',
        studentLatitude: 12.9715987,
        studentLongitude: 77.5945627,
        distanceFromLocation: 60,
        verified: true,
      })
    ).rejects.toThrow();
  });

  test('should allow same roll number in different sessions', async () => {
    const token2 = Session.generateToken();
    const session2 = await Session.create({
      locationId: location._id,
      tokenHash: Session.hashToken(token2),
      tokenPrefix: token2.substring(0, 4),
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    await Attendance.create({
      sessionId: session._id,
      studentName: 'John Doe',
      rollNumber: '21CS101',
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo123',
      studentLatitude: 12.9715987,
      studentLongitude: 77.5945627,
      distanceFromLocation: 50,
      verified: true,
    });

    const attendance2 = await Attendance.create({
      sessionId: session2._id,
      studentName: 'John Doe',
      rollNumber: '21CS101',
      photoUrl: 'https://example.com/photo2.jpg',
      photoPublicId: 'photo124',
      studentLatitude: 12.9715987,
      studentLongitude: 77.5945627,
      distanceFromLocation: 50,
      verified: true,
    });

    expect(attendance2.rollNumber).toBe('21CS101');
  });

  test('should fail for missing required fields', async () => {
    await expect(
      Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
      })
    ).rejects.toThrow();
  });

  test('should fail for invalid student latitude', async () => {
    await expect(
      Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
        rollNumber: '21CS102',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo125',
        studentLatitude: 91,
        studentLongitude: 77.5945627,
        distanceFromLocation: 50,
        verified: true,
      })
    ).rejects.toThrow();
  });

  test('should fail for invalid student longitude', async () => {
    await expect(
      Attendance.create({
        sessionId: session._id,
        studentName: 'John Doe',
        rollNumber: '21CS103',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo126',
        studentLatitude: 12.9715987,
        studentLongitude: 181,
        distanceFromLocation: 50,
        verified: true,
      })
    ).rejects.toThrow();
  });

  test('should uppercase roll number', async () => {
    const attendance = await Attendance.create({
      sessionId: session._id,
      studentName: 'Jane Doe',
      rollNumber: '21cs104',
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo127',
      studentLatitude: 12.9715987,
      studentLongitude: 77.5945627,
      distanceFromLocation: 50,
      verified: true,
    });
    expect(attendance.rollNumber).toBe('21CS104');
  });

  test('should fail for short studentName (< 2 chars)', async () => {
    await expect(
      Attendance.create({
        sessionId: session._id,
        studentName: 'J',
        rollNumber: '21CS105',
        photoUrl: 'https://example.com/photo.jpg',
        photoPublicId: 'photo128',
        studentLatitude: 12.9715987,
        studentLongitude: 77.5945627,
        distanceFromLocation: 50,
        verified: true,
      })
    ).rejects.toThrow();
  });
});
