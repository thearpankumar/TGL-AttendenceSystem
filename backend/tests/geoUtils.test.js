const Session = require('../src/models/Session');
const { calculateDistance } = require('../src/utils/geoUtils');

describe('GeoUtils', () => {
  describe('calculateDistance', () => {
    test('should calculate distance between two points correctly', () => {
      const distance = calculateDistance(12.9715987, 77.5945627, 12.975, 77.591);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1000);
    });

    test('should return 0 for same coordinates', () => {
      const distance = calculateDistance(12.9715987, 77.5945627, 12.9715987, 77.5945627);
      expect(distance).toBe(0);
    });

    test('should calculate distance for different hemispheres', () => {
      const distance = calculateDistance(40.7128, -74.0060, -33.8688, 151.2093);
      expect(distance).toBeGreaterThan(15000000);
    });

    test('should handle edge cases at poles', () => {
      const distance = calculateDistance(90, 0, -90, 0);
      expect(distance).toBeCloseTo(20015087, -1000);
    });

    test('should return NaN for invalid coordinates (NaN)', () => {
      const distance = calculateDistance(NaN, 77.594, 12.971, 77.594);
      expect(distance).toBeNaN();
    });

    test('should handle undefined coordinates', () => {
      const distance = calculateDistance(undefined, undefined, undefined, undefined);
      expect(distance).toBeNaN();
    });

    test('should calculate distance near equator', () => {
      const distance = calculateDistance(0, 0, 0, 1);
      expect(distance).toBeCloseTo(111194, -3);
    });

    test('should handle prime meridian crossing', () => {
      const distance = calculateDistance(51.5074, -0.1278, 48.8566, 2.3522);
      expect(distance).toBeGreaterThan(300000);
      expect(distance).toBeLessThan(400000);
    });
  });
});

describe('Session Model', () => {
  describe('generateToken', () => {
    test('should generate a 32-character token', () => {
      const token = Session.generateToken();
      expect(token).toHaveLength(32);
    });

    test('should generate unique tokens', () => {
      const token1 = Session.generateToken();
      const token2 = Session.generateToken();
      expect(token1).not.toBe(token2);
    });

    test('should generate alphanumeric tokens', () => {
      const token = Session.generateToken();
      expect(token).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('hashToken', () => {
    test('should return consistent hash for same input', () => {
      const token = 'testtoken123';
      const hash1 = Session.hashToken(token);
      const hash2 = Session.hashToken(token);
      expect(hash1).toBe(hash2);
    });

    test('should return 64-character SHA-256 hash', () => {
      const token = 'testtoken';
      const hash = Session.hashToken(token);
      expect(hash).toHaveLength(64);
    });

    test('should produce different hashes for different tokens', () => {
      const hash1 = Session.hashToken('token1');
      const hash2 = Session.hashToken('token2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
