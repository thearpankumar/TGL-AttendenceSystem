/**
 * verification.test.js
 *
 * Tests for the two new admin attendance verification endpoints:
 *   PATCH /api/admin/attendance/:id/verify       (single-record toggle)
 *   POST  /api/admin/sessions/:id/attendance/bulk-verify  (batch toggle)
 *
 * Edge cases covered:
 *   - Valid verify / unverify
 *   - Missing / non-boolean `verified` field
 *   - Record not found (404)
 *   - Cross-admin ownership protection (403)
 *   - Bulk: empty ids array
 *   - Bulk: too many ids (>100)
 *   - Bulk: invalid ObjectId in ids array
 *   - Bulk: records not belonging to session
 *   - Bulk: server-side homogeneity guard (mixed verified+unverified rejected)
 *   - Bulk: all verified → mark unverified
 *   - Bulk: all unverified → mark verified
 *   - Unauthenticated requests (401)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');
const Location = require('../src/models/Location');
const Session = require('../src/models/Session');
const Attendance = require('../src/models/Attendance');

let app;

beforeAll(async () => {
  app = require('../src/server');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createAdmin = async (suffix = '') => {
  const res = await request(app)
    .post('/api/admin/register')
    .send({
      username: `verifyAdmin${suffix}`,
      email: `verifyadmin${suffix}@example.com`,
      password: 'password123',
      adminSecret: 'test-admin-secret',
    });
  return { token: res.body.token, admin: res.body.admin };
};

const createLocation = async (token) => {
  const res = await request(app)
    .post('/api/admin/locations')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Verify Location', latitude: 12.97, longitude: 77.59, radiusMeters: 100 });
  return res.body;
};

const createSession = async (token, locationId) => {
  const res = await request(app)
    .post('/api/admin/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ locationId, durationMinutes: 30 });
  return res.body;
};

const createAttendance = async (sessionId, overrides = {}) =>
  Attendance.create({
    sessionId,
    studentName: overrides.studentName || 'Test Student',
    rollNumber: overrides.rollNumber || 'TS001',
    photoUrl: 'https://example.com/photo.jpg',
    photoPublicId: 'photos/test',
    studentLatitude: 12.97,
    studentLongitude: 77.59,
    distanceFromLocation: 30,
    verified: overrides.verified !== undefined ? overrides.verified : false,
    ...overrides,
  });

// ─── Single-record PATCH /api/admin/attendance/:id/verify ─────────────────────

describe('PATCH /api/admin/attendance/:id/verify — single record', () => {
  let token, location, session, record;

  beforeEach(async () => {
    ({ token } = await createAdmin('A'));
    location = await createLocation(token);
    session = await createSession(token, location._id);
    record = await createAttendance(session._id, { rollNumber: 'SV001', verified: false });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  test('returns 401 without auth token', async () => {
    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .send({ verified: true });
    expect(res.status).toBe(401);
  });

  // ── Valid toggling ──────────────────────────────────────────────────────────

  test('marks an unverified record as verified', async () => {
    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: true });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);

    const updated = await Attendance.findById(record._id);
    expect(updated.verified).toBe(true);
  });

  test('marks a verified record as unverified', async () => {
    // First mark verified
    record.verified = true;
    await record.save();

    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: false });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);

    const updated = await Attendance.findById(record._id);
    expect(updated.verified).toBe(false);
  });

  test('marking already-verified record as verified is idempotent (200)', async () => {
    record.verified = true;
    await record.save();

    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: true });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  test('returns 400 when `verified` is missing', async () => {
    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boolean/i);
  });

  test('returns 400 when `verified` is a string instead of boolean', async () => {
    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boolean/i);
  });

  test('returns 400 when `verified` is a number instead of boolean', async () => {
    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: 1 });
    expect(res.status).toBe(400);
  });

  // ── Not found ───────────────────────────────────────────────────────────────

  test('returns 404 for a non-existent attendance ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/admin/attendance/${fakeId}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: true });
    expect(res.status).toBe(404);
  });

  // ── Ownership ───────────────────────────────────────────────────────────────

  test('returns 403 when a different admin tries to verify the record', async () => {
    // Create a second admin — they should NOT be able to touch admin A's record
    const { token: tokenB } = await createAdmin('B');

    const res = await request(app)
      .patch(`/api/admin/attendance/${record._id}/verify`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ verified: true });

    expect(res.status).toBe(403);
    // DB record must be unchanged
    const unchanged = await Attendance.findById(record._id);
    expect(unchanged.verified).toBe(false);
  });
});

// ─── Bulk POST /api/admin/sessions/:id/attendance/bulk-verify ─────────────────

describe('POST /api/admin/sessions/:id/attendance/bulk-verify — batch', () => {
  let token, location, session;

  beforeEach(async () => {
    ({ token } = await createAdmin('C'));
    location = await createLocation(token);
    session = await createSession(token, location._id);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  test('returns 401 without auth token', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BV001', verified: false });
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .send({ ids: [r._id.toString()], verified: true });
    expect(res.status).toBe(401);
  });

  // ── Valid bulk operations ───────────────────────────────────────────────────

  test('bulk marks 3 unverified records as verified', async () => {
    const [r1, r2, r3] = await Promise.all([
      createAttendance(session._id, { rollNumber: 'BK001', verified: false }),
      createAttendance(session._id, { rollNumber: 'BK002', verified: false }),
      createAttendance(session._id, { rollNumber: 'BK003', verified: false }),
    ]);
    const ids = [r1._id, r2._id, r3._id].map(String);

    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, verified: true });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);

    const docs = await Attendance.find({ _id: { $in: ids } });
    docs.forEach(d => expect(d.verified).toBe(true));
  });

  test('bulk marks 2 verified records as unverified', async () => {
    const [r1, r2] = await Promise.all([
      createAttendance(session._id, { rollNumber: 'BK004', verified: true }),
      createAttendance(session._id, { rollNumber: 'BK005', verified: true }),
    ]);
    const ids = [r1._id, r2._id].map(String);

    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, verified: false });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const docs = await Attendance.find({ _id: { $in: ids } });
    docs.forEach(d => expect(d.verified).toBe(false));
  });

  test('bulk update of a single record works (edge case: array of 1)', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BK006', verified: false });
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [r._id.toString()], verified: true });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
  });

  test('idempotent: bulk-verifying already-verified records returns updated=0 (no change needed)', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BK007', verified: true });
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [r._id.toString()], verified: true });

    expect(res.status).toBe(200);
    // MongoDB updateMany reports modifiedCount=0 when value unchanged
    expect(res.body.updated).toBe(0);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  test('returns 400 when ids is empty array', async () => {
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [], verified: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/non-empty/i);
  });

  test('returns 400 when ids is not an array', async () => {
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: 'not-an-array', verified: true });
    expect(res.status).toBe(400);
  });

  test('returns 400 when ids contains more than 100 entries', async () => {
    const fakeIds = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString());
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: fakeIds, verified: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/100/);
  });

  test('returns 400 when ids contains an invalid ObjectId', async () => {
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: ['not-a-valid-id'], verified: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test('returns 400 when `verified` is missing from body', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BK008', verified: false });
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [r._id.toString()] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boolean/i);
  });

  test('returns 400 when `verified` is a string', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BK009', verified: false });
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [r._id.toString()], verified: 'true' });
    expect(res.status).toBe(400);
  });

  // ── Homogeneity guard ───────────────────────────────────────────────────────

  test('returns 400 when ids contain mixed verified + unverified records', async () => {
    const [verified, unverified] = await Promise.all([
      createAttendance(session._id, { rollNumber: 'MX001', verified: true }),
      createAttendance(session._id, { rollNumber: 'MX002', verified: false }),
    ]);

    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [verified._id.toString(), unverified._id.toString()], verified: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mixed/i);

    // DB must be untouched
    const vDoc = await Attendance.findById(verified._id);
    const uDoc = await Attendance.findById(unverified._id);
    expect(vDoc.verified).toBe(true);
    expect(uDoc.verified).toBe(false);
  });

  test('homogeneity guard: 3 unverified + 1 verified returns 400', async () => {
    const records = await Promise.all([
      createAttendance(session._id, { rollNumber: 'MX003', verified: false }),
      createAttendance(session._id, { rollNumber: 'MX004', verified: false }),
      createAttendance(session._id, { rollNumber: 'MX005', verified: false }),
      createAttendance(session._id, { rollNumber: 'MX006', verified: true }),
    ]);
    const ids = records.map(r => r._id.toString());

    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, verified: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mixed/i);
  });

  // ── Session & ownership checks ──────────────────────────────────────────────

  test('returns 404 for a non-existent session', async () => {
    const r = await createAttendance(session._id, { rollNumber: 'BK010', verified: false });
    const fakeSessionId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/sessions/${fakeSessionId}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [r._id.toString()], verified: true });
    expect(res.status).toBe(404);
  });

  test('returns 400 when record IDs do not belong to the given session', async () => {
    // Create a second session and a record in it
    const session2 = await createSession(token, location._id);
    const foreignRecord = await createAttendance(session2._id, { rollNumber: 'FK001', verified: false });

    // Try to bulk-verify it under session (not session2)
    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [foreignRecord._id.toString()], verified: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong/i);
    // Foreign record must be untouched
    const unchanged = await Attendance.findById(foreignRecord._id);
    expect(unchanged.verified).toBe(false);
  });

  test('returns 404 (session not found) when a different admin tries bulk-verify', async () => {
    const { token: tokenD } = await createAdmin('D');
    const r = await createAttendance(session._id, { rollNumber: 'OW001', verified: false });

    const res = await request(app)
      .post(`/api/admin/sessions/${session._id}/attendance/bulk-verify`)
      .set('Authorization', `Bearer ${tokenD}`)
      .send({ ids: [r._id.toString()], verified: true });

    // Session lookup includes createdBy check, so other admin gets 404
    expect(res.status).toBe(404);
    const unchanged = await Attendance.findById(r._id);
    expect(unchanged.verified).toBe(false);
  });
});
