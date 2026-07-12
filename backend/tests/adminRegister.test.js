const request = require('supertest');
const Admin = require('../src/models/Admin');

let app;

beforeAll(async () => {
  app = require('../src/server');
});

beforeEach(async () => {
  await Admin.deleteMany({});
});

const validBody = (overrides = {}) => ({
  username: 'newadmin',
  email: 'newadmin@example.com',
  password: 'password123',
  adminSecret: 'test-admin-secret',
  ...overrides,
});

describe('POST /api/admin/register', () => {
  it('creates an admin and returns a token without leaking the password', async () => {
    const res = await request(app).post('/api/admin/register').send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.admin.username).toBe('newadmin');
    expect(res.body.admin.email).toBe('newadmin@example.com');
    expect(res.body.admin.password).toBeUndefined();

    const stored = await Admin.findOne({ username: 'newadmin' });
    expect(stored.password).not.toBe('password123');
  });

  it('rejects a wrong adminSecret with 403 and does not create the account', async () => {
    const res = await request(app)
      .post('/api/admin/register')
      .send(validBody({ adminSecret: 'wrong-secret' }));

    expect(res.status).toBe(403);
    expect(await Admin.findOne({ username: 'newadmin' })).toBeNull();
  });

  it('rejects a missing adminSecret with 403', async () => {
    const body = validBody();
    delete body.adminSecret;

    const res = await request(app).post('/api/admin/register').send(body);
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate username with 400', async () => {
    await request(app).post('/api/admin/register').send(validBody());

    const res = await request(app)
      .post('/api/admin/register')
      .send(validBody({ email: 'different@example.com' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Admin already exists');
  });

  it('rejects a duplicate email with 400', async () => {
    await request(app).post('/api/admin/register').send(validBody());

    const res = await request(app)
      .post('/api/admin/register')
      .send(validBody({ username: 'differentuser' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Admin already exists');
  });

  it.each([
    ['username too short', { username: 'ab' }],
    ['username with symbols', { username: 'bad-name!' }],
    ['invalid email', { email: 'not-an-email' }],
    ['password too short', { password: '123' }],
  ])('rejects %s with a 400 validation error', async (_label, overrides) => {
    const res = await request(app).post('/api/admin/register').send(validBody(overrides));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects a NoSQL-injection-shaped username instead of matching an existing admin', async () => {
    await request(app).post('/api/admin/register').send(validBody());

    const res = await request(app)
      .post('/api/admin/register')
      .send(validBody({ username: { $ne: null }, email: 'other@example.com' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });
});
