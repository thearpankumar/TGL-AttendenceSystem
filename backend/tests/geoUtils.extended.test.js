const Session = require('../src/models/Session');
const { calculateDistance } = require('../src/utils/geoUtils');

describe('GeoUtils Extended Tests', () => {
  describe('calculateDistance - Boundary Cases', () => {
    test('should return 0 for identical coordinates', () => {
      const distance = calculateDistance(12.971, 77.594, 12.971, 77.594);
      expect(distance).toBe(0);
    });
    
    test('should handle coordinates at equator', () => {
      const distance = calculateDistance(0, 0, 0, 1);
      expect(distance).toBeCloseTo(111194, -3);
    });
    
    test('should handle coordinates at prime meridian', () => {
      const distance = calculateDistance(51.5074, 0, 48.8566, 0);
      expect(distance).toBeGreaterThan(250000);
      expect(distance).toBeLessThan(300000);
    });
    
    test('should handle north pole to south pole', () => {
      const distance = calculateDistance(90, 0, -90, 0);
      expect(distance).toBeCloseTo(20015087, -5);
    });
    
    test('should handle very small distances', () => {
      const distance = calculateDistance(12.971, 77.594, 12.971, 77.59400001);
      expect(distance).toBeLessThan(1);
    });
    
    test('should handle large distances', () => {
      const distance = calculateDistance(40.7128, -74.0060, -33.8688, 151.2093);
      expect(distance).toBeGreaterThan(15000000);
      expect(distance).toBeLessThan(20000000);
    });
  });
  
  describe('calculateDistance - Precision Tests', () => {
    test('should be consistent in both directions', () => {
      const d1 = calculateDistance(12.971, 77.594, 13.0, 78.0);
      const d2 = calculateDistance(13.0, 78.0, 12.971, 77.594);
      expect(d1).toBeCloseTo(d2, 10);
    });
    
    test('should handle float precision edge cases', () => {
      const distance = calculateDistance(0.0000001, 0.0000001, -0.0000001, -0.0000001);
      expect(distance).toBeLessThan(100);
    });
    
    test('should calculate ~100m correctly', () => {
      const distance = calculateDistance(12.9715987, 77.5945627, 12.9724, 77.5945627);
      expect(distance).toBeGreaterThan(80);
      expect(distance).toBeLessThan(120);
    });
    
    test('should calculate ~1km correctly', () => {
      const distance = calculateDistance(12.971, 77.594, 12.980, 77.594);
      expect(distance).toBeGreaterThan(900);
      expect(distance).toBeLessThan(1100);
    });
  });
  
  describe('calculateDistance - Invalid Input Tests', () => {
    test('should return NaN for NaN coordinates', () => {
      expect(calculateDistance(NaN, 77.594, 12.971, 77.594)).toBeNaN();
      expect(calculateDistance(12.971, NaN, 12.971, 77.594)).toBeNaN();
    });
    
    test('should return NaN for undefined coordinates', () => {
      expect(calculateDistance(undefined, 77.594, 12.971, 77.594)).toBeNaN();
      expect(calculateDistance(12.971, undefined, 12.971, 77.594)).toBeNaN();
    });
    
    test('should handle Infinity', () => {
      expect(calculateDistance(Infinity, 77.594, 12.971, 77.594)).toBeNaN();
    });
  });
});

describe('Session Token Tests', () => {
  describe('generateToken - Extended Tests', () => {
    test('should generate exactly 32 characters', () => {
      const token = Session.generateToken();
      expect(token).toHaveLength(32);
    });
    
    test('should only contain hexadecimal characters', () => {
      const token = Session.generateToken();
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });
    
    test('should generate unique tokens (collision test)', () => {
      const tokens = new Set();
      for (let i = 0; i < 1000; i++) {
        tokens.add(Session.generateToken());
      }
      expect(tokens.size).toBe(1000);
    });
    
    test('should not generate empty token', () => {
      const token = Session.generateToken();
      expect(token).not.toBe('');
      expect(token).not.toBe(null);
      expect(token).not.toBe(undefined);
    });
  });
  
  describe('hashToken - Extended Tests', () => {
    test('should return exactly 64 characters (SHA-256)', () => {
      const hash = Session.hashToken('testtoken');
      expect(hash).toHaveLength(64);
    });
    
    test('should only contain hexadecimal characters', () => {
      const hash = Session.hashToken('testtoken');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
    
    test('should be deterministic', () => {
      const token = 'sametokenvalue';
      const hash1 = Session.hashToken(token);
      const hash2 = Session.hashToken(token);
      expect(hash1).toBe(hash2);
    });
    
    test('should produce different hashes for similar tokens', () => {
      const hash1 = Session.hashToken('token1');
      const hash2 = Session.hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });
    
    test('should handle empty string', () => {
      const hash = Session.hashToken('');
      expect(hash).toHaveLength(64);
    });
    
    test('should handle special characters', () => {
      const hash = Session.hashToken('!@#$%^&*()');
      expect(hash).toHaveLength(64);
    });
    
    test('should handle unicode characters', () => {
      const hash = Session.hashToken('日本語');
      expect(hash).toHaveLength(64);
    });
    
    test('should handle very long tokens', () => {
      const longToken = 'a'.repeat(1000);
      const hash = Session.hashToken(longToken);
      expect(hash).toHaveLength(64);
    });
  });
  
  describe('Token Security Tests', () => {
    test('should not be reversible (one-way hash)', () => {
      const token = 'testtoken123';
      const hash = Session.hashToken(token);
      expect(hash).not.toBe(token);
      expect(hash).not.toContain(token);
    });
    
    test('should produce different hashes for case variations', () => {
      const hash1 = Session.hashToken('ABC');
      const hash2 = Session.hashToken('abc');
      expect(hash1).not.toBe(hash2);
    });
    
    test('should handle whitespace correctly', () => {
      const hash1 = Session.hashToken('test');
      const hash2 = Session.hashToken(' test');
      const hash3 = Session.hashToken('test ');
      const hash4 = Session.hashToken(' test ');
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toBe(hash4);
    });
  });
});

describe('Distance Calculation Edge Cases', () => {
  test('should handle same location with different precision', () => {
    const d1 = calculateDistance(12.9715987, 77.5945627, 12.9715987, 77.5945627);
    const d2 = calculateDistance(12.971, 77.595, 12.971, 77.595);
    
    expect(d1).toBe(0);
    expect(d2).toBe(0);
  });
  
  test('should handle negative coordinates in both positions', () => {
    const distance = calculateDistance(-33.8688, -151.2093, -33.8688, -151.2093);
    expect(distance).toBe(0);
  });
  
  test('should handle mixed sign coordinates', () => {
    const distance = calculateDistance(40.7128, -74.0060, -33.8688, 151.2093);
    expect(distance).toBeGreaterThan(0);
  });
  
  test('should calculate accurate distance for known locations', () => {
    const Bangalore = { lat: 12.9716, lon: 77.5946 };
    const Delhi = { lat: 28.7041, lon: 77.1025 };
    
    const distance = calculateDistance(Bangalore.lat, Bangalore.lon, Delhi.lat, Delhi.lon);
    
    expect(distance).toBeGreaterThan(1700000);
    expect(distance).toBeLessThan(1800000);
  });
});

describe('Performance Tests', () => {
  test('should handle 10000 calculations quickly', () => {
    const start = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      calculateDistance(12.971, 77.594, 13.0, 78.0);
    }
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  
  test('should handle 1000 token generations quickly', () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      Session.generateToken();
    }
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  
  test('should handle 1000 hash operations quickly', () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      Session.hashToken(`token${i}`);
    }
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
