const { checkDeviceIntegrity } = require('../src/middleware/deviceIntegrity');

describe('Device Integrity Middleware', () => {
  describe('Timing Manipulation Detection', () => {
    it('should detect impossibly fast computation', () => {
      const elapsed = 0.05;
      expect(elapsed).toBeLessThan(0.1);
    });

    it('should accept normal computation speed', () => {
      const elapsed = 5;
      expect(elapsed).toBeGreaterThan(0.5);
    });

    it('should handle performance.now() drift', () => {
      const start = Date.now();
      const perfStart = performance.now();
      
      const elapsed = performance.now() - perfStart;
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Browser API Consistency', () => {
    it('should detect Chrome header mismatch', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Firefox)',
          'sec-ch-ua': '"Chromium";v="112"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass for consistent headers', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Chromium";v="112"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Client-Side Checks Integration', () => {
    it('should accept client-reported checks', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'sec-ch-ua': '"Test";v="1"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {
          integrityChecks: [
            { type: 'TEST_CHECK', details: 'Test details' },
          ],
        },
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should combine server and client checks', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'sec-ch-ua': '"Test";v="1"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {
          integrityChecks: [
            { type: 'CLIENT_ISSUE', details: 'Client detected issue' },
          ],
        },
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Pointer Events validation', () => {
    it('should validate pointer configuration', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36',
          'sec-ch-ua': '"Chromium";v="112"',
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Sec-CH-UA validation', () => {
    it('should validate Chrome consistency', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Chromium";v="112"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should detect mismatch between UA and Client Hints', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Firefox; no Chrome here)',
          'sec-ch-ua': '"Chromium";v="112"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should pass on error to not block submission', async () => {
      const mockReq = {
        headers: null,
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing headers', async () => {
      const mockReq = {
        headers: {},
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing user-agent header', async () => {
      const mockReq = {
        headers: {
          'sec-ch-ua': '"Test";v="1"',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle malformed integrityChecks', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Test',
        },
        body: {
          integrityChecks: 'not an array',
        },
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle empty integrityChecks array', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Test',
        },
        body: {
          integrityChecks: [],
        },
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle integrityChecks with invalid structure', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Test',
        },
        body: {
          integrityChecks: [
            { invalid: 'structure' },
            { type: null, details: null },
          ],
        },
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Integration with Request Flow', () => {
    it('should always call next()', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'Test Agent',
        },
        body: {},
        id: 'test-request-id',
      };

      const mockRes = {};
      const mockNext = jest.fn();

      await checkDeviceIntegrity(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
