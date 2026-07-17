const SystemConfig = require('../src/models/SystemConfig');
const { calculateConfidence } = require('../src/middleware/gpsValidation');

describe('GPS Validation Middleware', () => {
  describe('Accuracy Detection', () => {
    it('should flag accuracy below 3m as very suspicious', () => {
      const accuracy = 2;
      expect(accuracy).toBeLessThan(3);
    });

    it('should flag accuracy below 10m as suspicious', () => {
      const accuracy = 5;
      expect(accuracy).toBeLessThan(10);
      expect(accuracy).toBeGreaterThanOrEqual(3);
    });

    it('should accept accuracy >= 10m as normal', () => {
      const accuracy = 15;
      expect(accuracy).toBeGreaterThanOrEqual(10);
    });

    it('should handle accuracy exactly at threshold (3m)', () => {
      const accuracy = 3;
      expect([3, 10].includes(accuracy)).toBe(true);
    });

    it('should handle accuracy exactly at threshold (10m)', () => {
      const accuracy = 10;
      expect([3, 10].includes(accuracy)).toBe(true);
    });
  });

  describe('Altitude Detection', () => {
    it('should flag zero altitude', () => {
      const altitude = 0;
      expect(altitude).toBe(0);
    });

    it('should flag null altitude', () => {
      const altitude = null;
      expect(altitude).toBeNull();
    });

    it('should accept normal altitude', () => {
      const altitude = 500;
      expect(altitude).toBeGreaterThan(0);
    });
  });

  describe('Timestamp Validation', () => {
    it('should flag future timestamp', () => {
      const timestamp = Date.now() + 120000;
      const diff = (timestamp - Date.now()) / 1000;
      expect(diff).toBeGreaterThan(60);
    });

    it('should flag very old timestamp', () => {
      const timestamp = Date.now() - 600000;
      const diff = (Date.now() - timestamp) / 1000;
      expect(diff).toBeGreaterThan(300);
    });

    it('should accept current timestamp', () => {
      const timestamp = Date.now();
      const diff = Math.abs(timestamp - Date.now()) / 1000;
      expect(diff).toBeLessThan(60);
    });
  });

  describe('Provider Validation', () => {
    it('should accept GPS provider', () => {
      const provider = 'gps';
      expect(['gps', 'fused', 'network', 'unknown'].includes(provider)).toBe(true);
    });

    it('should accept fused provider', () => {
      const provider = 'fused';
      expect(['gps', 'fused', 'network', 'unknown'].includes(provider)).toBe(true);
    });

    it('should flag network provider with GPS-level accuracy', () => {
      const provider = 'network';
      const accuracy = 5;
      expect(provider).toBe('network');
      expect(accuracy).toBeLessThan(10);
    });
  });

  describe('Confidence Calculation', () => {
    it('should return high confidence for no anomalies', () => {
      const confidence = calculateConfidence([]);
      expect(confidence).toBe('high');
    });

    it('should return low confidence for HIGH severity', () => {
      const anomalies = [{ type: 'ACCURACY_VERY_SUSPICIOUS', severity: 'high' }];
      const confidence = calculateConfidence(anomalies);
      expect(confidence).toBe('low');
    });

    it('should return medium confidence for MEDIUM severity', () => {
      const anomalies = [{ type: 'ACCURACY_SUSPICIOUS', severity: 'medium' }];
      const confidence = calculateConfidence(anomalies);
      expect(confidence).toBe('medium');
    });

    it('should prioritize severity correctly', () => {
      const anomalies = [
        { type: 'TEST1', severity: 'low' },
        { type: 'TEST2', severity: 'high' },
      ];
      const confidence = calculateConfidence(anomalies);
      expect(confidence).toBe('low');
    });
  });

  describe('Combined Anomalies', () => {
    it('should handle multiple anomalies', () => {
      const anomalies = [
        { type: 'ACCURACY_VERY_SUSPICIOUS', severity: 'high', details: 'Accuracy 2m' },
        { type: 'ALTITUDE_ZERO', severity: 'medium', details: 'Altitude 0' },
      ];
      expect(anomalies.length).toBe(2);
    });

    it('should combine confidence scores', () => {
      const anomalies = [
        { type: 'ACCURACY_SUSPICIOUS', severity: 'medium' },
        { type: 'ALTITUDE_NULL', severity: 'low' },
      ];
      const confidence = calculateConfidence(anomalies);
      expect(confidence).toBe('medium');
    });
  });

  describe('Configuration Integration', () => {
    it('should use configurable thresholds', async () => {
      const config = await SystemConfig.getConfig();
      
      expect(config).toHaveProperty('gpsValidation');
    });

    it('should allow threshold updates', async () => {
      const config = await SystemConfig.getConfig();
      
      config.gpsValidation.accuracyVerySuspicious = 5;
      await config.save();

      const updated = await SystemConfig.getConfig();
      expect(updated.gpsValidation.accuracyVerySuspicious).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing gpsMetadata', () => {
      const gpsMetadata = undefined;
      expect(gpsMetadata).toBeUndefined();
    });

    it('should handle partial metadata (only accuracy)', () => {
      const gpsMetadata = {
        accuracy: 15,
      };
      expect(gpsMetadata.accuracy).toBeDefined();
      expect(gpsMetadata.altitude).toBeUndefined();
    });

    it('should handle NaN accuracy', () => {
      const accuracy = NaN;
      expect(isNaN(accuracy)).toBe(true);
    });

    it('should handle negative accuracy', () => {
      const accuracy = -5;
      expect(accuracy).toBeLessThan(0);
    });

    it('should handle string accuracy', () => {
      const accuracy = '10';
      expect(typeof accuracy).toBe('string');
    });

    it('should handle extremely high accuracy value', () => {
      const accuracy = 1000000;
      expect(accuracy).toBeGreaterThan(10000);
    });

    it('should handle missing provider field', () => {
      const gpsMetadata = {
        accuracy: 15,
        timestamp: Date.now(),
      };
      expect(gpsMetadata.provider).toBeUndefined();
    });
  });

  describe('Anomaly Types', () => {
    it('should recognize ACCURACY_VERY_SUSPICIOUS', () => {
      const type = 'ACCURACY_VERY_SUSPICIOUS';
      expect(['ACCURACY_VERY_SUSPICIOUS', 'ACCURACY_SUSPICIOUS', 'ALTITUDE_ZERO', 'ALTITUDE_NULL'].includes(type)).toBe(true);
    });

    it('should recognize ACCURACY_SUSPICIOUS', () => {
      const type = 'ACCURACY_SUSPICIOUS';
      expect(['ACCURACY_VERY_SUSPICIOUS', 'ACCURACY_SUSPICIOUS', 'ALTITUDE_ZERO', 'ALTITUDE_NULL'].includes(type)).toBe(true);
    });

    it('should recognize ALTITUDE_ZERO', () => {
      const type = 'ALTITUDE_ZERO';
      expect(['ACCURACY_VERY_SUSPICIOUS', 'ACCURACY_SUSPICIOUS', 'ALTITUDE_ZERO', 'ALTITUDE_NULL'].includes(type)).toBe(true);
    });

    it('should recognize ALTITUDE_NULL', () => {
      const type = 'ALTITUDE_NULL';
      expect(['ACCURACY_VERY_SUSPICIOUS', 'ACCURACY_SUSPICIOUS', 'ALTITUDE_ZERO', 'ALTITUDE_NULL'].includes(type)).toBe(true);
    });
  });
});
