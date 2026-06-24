const { getCaptcha } = require('../src/controllers/attendanceController');

describe('Captcha Controller Unit Tests', () => {
  test('should generate captcha SVG and signed stateless captchaId', async () => {
    const req = {};
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    };
    
    await getCaptcha(req, res);
    
    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.captchaSvg).toBeDefined();
    expect(data.captchaSvg).toContain('<svg');
    expect(data.captchaId).toBeDefined();
    
    const parts = data.captchaId.split('.');
    expect(parts.length).toBe(2);
    
    const timestamp = parseInt(parts[0], 10);
    expect(isNaN(timestamp)).toBe(false);
    expect(Date.now() - timestamp).toBeLessThan(5000);
  });

  test('should set headers to disable caching of captcha', async () => {
    const req = {};
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    };
    
    await getCaptcha(req, res);
    
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
  });
});
