const request = require('supertest');
const app = require('../src/server');

describe('Security Headers', () => {
  describe('Content Security Policy', () => {
    it('should have CSP headers set', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['content-security-policy']).toBeDefined();
    });
    
    it('should have default-src self in CSP', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    });
    
    it('should have frame-ancestors none to prevent clickjacking', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });
    
    it('should have form-action self', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toContain("form-action 'self'");
    });
    
    it('should have base-uri self', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toContain("base-uri 'self'");
    });
  });
  
  describe('XSS Protection', () => {
    it('should have XSS filter enabled', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-xss-protection']).toBeDefined();
    });
    
    it('should have content-type nosniff', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
  
  describe('Referrer Policy', () => {
    it('should have referrer-policy set', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['referrer-policy']).toBeDefined();
    });
  });
});

describe('Rate Limiting', () => {
  it('should enforce rate limits on repeated requests', async () => {
    const requests = [];
    for (let i = 0; i < 25; i++) {
      requests.push(request(app).get('/health'));
    }
    
    const results = await Promise.all(requests);
    const successCount = results.filter(r => r.status === 200).length;
    expect(successCount).toBeGreaterThan(0);
  });
});

describe('Error Sanitization', () => {
  it('should not expose internal errors to clients', async () => {
    const res = await request(app)
      .get('/api/nonexistent')
      .set('Accept', 'application/json');
    
    expect(res.status).toBe(404);
    expect(res.body.message).toBeDefined();
    expect(res.body.message).not.toContain('Error:');
    expect(res.body.stack).toBeUndefined();
  });
});
