const request = require('supertest');
const Admin = require('../src/models/Admin');

let app;

beforeAll(async () => {
  app = require('../src/server');
});

beforeEach(async () => {
  await Admin.deleteMany({});
});

async function register(username, password) {
  return request(app)
    .post('/api/admin/register')
    .send({
      username,
      email: `${username}@example.com`,
      password,
      adminSecret: 'test-admin-secret',
    });
}

describe('Admin account lockout', () => {
  it('locks the account after 5 failed attempts, rejecting even the correct password', async () => {
    await register('lockuser', 'password123');

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'lockuser', password: 'wrongpass' });
      expect(res.status).toBe(401);
    }

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'lockuser', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');

    const admin = await Admin.findOne({ username: 'lockuser' });
    expect(admin.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('unlocks and resets the counter once lockUntil has passed', async () => {
    await register('unlockuser', 'password123');

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/admin/login')
        .send({ username: 'unlockuser', password: 'wrongpass' });
    }

    // Roll the lock into the past instead of sleeping 15 minutes in a test.
    await Admin.updateOne(
      { username: 'unlockuser' },
      { lockUntil: new Date(Date.now() - 1000) }
    );

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'unlockuser', password: 'password123' });

    expect(res.status).toBe(200);

    const admin = await Admin.findOne({ username: 'unlockuser' });
    expect(admin.failedLoginAttempts).toBe(0);
    expect(admin.lockUntil).toBeNull();
  });

  it('increments failedLoginAttempts atomically under concurrent failed logins', async () => {
    await register('raceuser', 'password123');

    const results = await Promise.all(
      Array(5)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/admin/login')
            .send({ username: 'raceuser', password: 'wrongpass' })
        )
    );

    results.forEach((res) => expect(res.status).toBe(401));

    const admin = await Admin.findOne({ username: 'raceuser' });
    expect(admin.failedLoginAttempts).toBe(5);
    expect(admin.lockUntil).not.toBeNull();
    expect(admin.lockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns the identical response for an unknown username, a wrong password, and a locked account', async () => {
    await register('enumuser', 'password123');
    await register('wrongpassuser', 'password123');

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/admin/login')
        .send({ username: 'enumuser', password: 'wrongpass' });
    }

    const noUser = await request(app)
      .post('/api/admin/login')
      .send({ username: 'doesnotexist', password: 'whatever' });

    const wrongPass = await request(app)
      .post('/api/admin/login')
      .send({ username: 'wrongpassuser', password: 'wrongpass' });

    const locked = await request(app)
      .post('/api/admin/login')
      .send({ username: 'enumuser', password: 'password123' });

    expect(noUser.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(locked.status).toBe(401);
    expect(noUser.body.message).toBe('Invalid credentials');
    expect(wrongPass.body.message).toBe('Invalid credentials');
    expect(locked.body.message).toBe('Invalid credentials');
  });

  it('resets failedLoginAttempts to 0 after a successful login', async () => {
    await register('resetuser', 'password123');

    await request(app)
      .post('/api/admin/login')
      .send({ username: 'resetuser', password: 'wrongpass' });
    await request(app)
      .post('/api/admin/login')
      .send({ username: 'resetuser', password: 'wrongpass' });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'resetuser', password: 'password123' });

    expect(res.status).toBe(200);

    const admin = await Admin.findOne({ username: 'resetuser' });
    expect(admin.failedLoginAttempts).toBe(0);
  });

  it('does not lock the account before the 5th failed attempt', async () => {
    await register('boundaryuser', 'password123');

    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'boundaryuser', password: 'wrongpass' });
      expect(res.status).toBe(401);
    }

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'boundaryuser', password: 'password123' });

    expect(res.status).toBe(200);
  });
});

describe('Admin login validation', () => {
  it('rejects a missing username with 400', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: 'whatever' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects a missing password with 400', async () => {
    const res = await request(app).post('/api/admin/login').send({ username: 'someone' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects an empty-string username with 400', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: '   ', password: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('rejects a NoSQL-injection-shaped username/password instead of matching any admin', async () => {
    await register('victimuser', 'realpassword');

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns a token and no password field on successful login', async () => {
    await register('shapeuser', 'password123');

    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'shapeuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.username).toBe('shapeuser');
    expect(res.body.password).toBeUndefined();
  });
});
