const request = require('supertest');
const mongoose = require('mongoose');
const Session = require('../src/models/Session');
const Admin = require('../src/models/Admin');
const Location = require('../src/models/Location');
const Attendance = require('../src/models/Attendance');
const ExcelJS = require('exceljs');

let app;

beforeAll(async () => {
  app = require('../src/server');
});

beforeEach(async () => {
  await Session.deleteMany({});
  await Admin.deleteMany({});
  await Location.deleteMany({});
  await Attendance.deleteMany({});
});

describe('Export Session Attendance to Excel', () => {
  let adminToken, admin, location, session;

  beforeEach(async () => {
    const adminRes = await request(app)
      .post('/api/admin/register')
      .send({
        username: 'testadminexport',
        email: 'export@example.com',
        password: 'password123',
        adminSecret: 'test-admin-secret'
      });
    
    if (adminRes.status !== 201) {
      console.error('Registration failed:', adminRes.body);
    }
    expect(adminRes.status).toBe(201);
    adminToken = adminRes.body.token;
    admin = adminRes.body.admin;

    const locationRes = await request(app)
      .post('/api/admin/locations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Export Location',
        latitude: 12.9716,
        longitude: 77.5946,
        radiusMeters: 100
      });

    location = locationRes.body;

    const sessionRes = await request(app)
      .post('/api/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        locationId: location._id,
        durationMinutes: 30
      });

    session = sessionRes.body;
  });

  test('should return 401 without token', async () => {
    const res = await request(app)
      .get(`/api/admin/sessions/${session._id}/export`);
    
    expect(res.status).toBe(401);
  });

  test('should return 404 for non-existent session', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/admin/sessions/${fakeId}/export`)
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.status).toBe(404);
  });

  test('should successfully export attendance data as Excel sheet', async () => {
    await Attendance.create({
      sessionId: session._id,
      studentName: 'Alice',
      studentId: 'A001',
      rollNumber: 'A001',
      distanceFromLocation: 25.4,
      studentLatitude: 12.0,
      studentLongitude: 77.0,
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo1',
      capturedAt: new Date(),
      verified: true
    });
    
    await Attendance.create({
      sessionId: session._id,
      studentName: 'Bob',
      studentId: 'B002',
      rollNumber: 'B002',
      distanceFromLocation: 500,
      studentLatitude: 13.0,
      studentLongitude: 78.0,
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo2',
      deviceFlag: 'MULTI_STUDENT_DEVICE',
      capturedAt: new Date(),
      verified: false
    });

    const res = await request(app)
      .get(`/api/admin/sessions/${session._id}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = Buffer.from('');
        r.on('data', chunk => data = Buffer.concat([data, chunk]));
        r.on('end', () => cb(null, data));
      })
      .expect('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    
    const worksheet = workbook.getWorksheet('Attendance');
    expect(worksheet).toBeDefined();
    
    const headers = worksheet.getRow(1).values.slice(1);
    expect(headers).toContain('Roll Number');
    expect(headers).toContain('Student Name');
    expect(headers).toContain('Location');
    expect(headers).toContain('Warnings');
    
    // Only verified records should be exported — Alice (verified), Bob (unverified) excluded
    expect(worksheet.rowCount).toBe(2); // 1 header + 1 data row
    
    const row2 = worksheet.getRow(2).values.slice(1);
    expect(row2[0]).toBe('A001'); 
    expect(row2[1]).toBe('Alice');
    expect(row2[2]).toBe('Export Location');
    expect(row2[4]).toBe('Verified');
    
    // Bob (unverified) must NOT appear in the export
    const allRollNumbers = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) allRollNumbers.push(row.getCell(1).value);
    });
    expect(allRollNumbers).not.toContain('B002');
  });

  test('should export empty sheet when no verified records exist', async () => {
    // Only unverified record — nothing should be in the data rows
    await Attendance.create({
      sessionId: session._id,
      studentName: 'Charlie',
      rollNumber: 'C003',
      distanceFromLocation: 800,
      studentLatitude: 13.0,
      studentLongitude: 78.0,
      photoUrl: 'https://example.com/photo.jpg',
      photoPublicId: 'photo3',
      capturedAt: new Date(),
      verified: false
    });

    const res = await request(app)
      .get(`/api/admin/sessions/${session._id}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        let data = Buffer.from('');
        r.on('data', chunk => data = Buffer.concat([data, chunk]));
        r.on('end', () => cb(null, data));
      })
      .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const worksheet = workbook.getWorksheet('Attendance');
    // Only header row — no data rows
    expect(worksheet.rowCount).toBe(1);
  });
});

