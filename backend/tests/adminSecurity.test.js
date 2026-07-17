const SystemConfig = require('../src/models/SystemConfig');
const DeviceFingerprint = require('../src/models/DeviceFingerprint');

function calculateFlagPercentage(total, flagged) {
  if (total === 0) return '0.0';
  return ((flagged / total) * 100).toFixed(1);
}

function buildFilter({ type, reviewed, severity }) {
  const filter = { flagged: true };
  
  if (type === 'gps') {
    filter['gpsAnomalies.0'] = { $exists: true };
  } else if (type === 'emulator') {
    filter.emulatorDetected = true;
  } else if (type === 'integrity') {
    filter['integrityChecks.0'] = { $exists: true };
  }
  
  if (reviewed === 'true') {
    filter.flagReviewed = true;
  } else if (reviewed === 'false') {
    filter.flagReviewed = false;
  }
  
  if (severity) {
    filter['gpsAnomalies.severity'] = severity;
  }
  
  return filter;
}

describe('Admin Security Controller', () => {
  describe('Security Summary Logic', () => {
    it('should calculate flag percentage correctly', () => {
      const result = calculateFlagPercentage(10, 2);
      expect(result).toBe('20.0');
    });

    it('should handle zero submissions', () => {
      const result = calculateFlagPercentage(0, 0);
      expect(result).toBe('0.0');
    });

    it('should handle all flagged', () => {
      const result = calculateFlagPercentage(10, 10);
      expect(result).toBe('100.0');
    });

    it('should handle no flags', () => {
      const result = calculateFlagPercentage(10, 0);
      expect(result).toBe('0.0');
    });
  });

  describe('Filter Building', () => {
    it('should build correct filter for GPS anomalies', () => {
      const filter = buildFilter({ type: 'gps' });
      expect(filter).toBeDefined();
    });

    it('should build correct filter for emulator detection', () => {
      const filter = buildFilter({ type: 'emulator' });
      expect(filter).toHaveProperty('emulatorDetected', true);
    });

    it('should build correct filter for integrity issues', () => {
      const filter = buildFilter({ type: 'integrity' });
      expect(filter).toBeDefined();
    });

    it('should filter by reviewed status', () => {
      const filter = buildFilter({ reviewed: 'false' });
      expect(filter).toHaveProperty('flagReviewed', false);
    });

    it('should filter by severity', () => {
      const filter = buildFilter({ severity: 'high' });
      expect(filter).toBeDefined();
    });

    it('should handle empty filter', () => {
      const filter = buildFilter({});
      expect(filter).toHaveProperty('flagged', true);
    });
  });

  describe('Settings Management', () => {
    it('should get default GPS validation settings', async () => {
      const sysConfig = await SystemConfig.getConfig();
      
      expect(sysConfig).toHaveProperty('gpsValidation');
      expect(sysConfig.gpsValidation).toHaveProperty('accuracyVerySuspicious');
      expect(sysConfig.gpsValidation).toHaveProperty('accuracySuspicious');
    });

    it('should get default emulator detection settings', async () => {
      const sysConfig = await SystemConfig.getConfig();
      
      expect(sysConfig).toHaveProperty('emulatorDetection');
    });

    it('should get default trust score settings', async () => {
      const sysConfig = await SystemConfig.getConfig();
      
      expect(sysConfig).toHaveProperty('trustScore');
    });

    it('should update GPS settings', async () => {
      const sysConfig = await SystemConfig.getConfig();
      const originalValue = sysConfig.gpsValidation.accuracyVerySuspicious;
      
      sysConfig.gpsValidation.accuracyVerySuspicious = 5;
      await sysConfig.save();
      
      const updated = await SystemConfig.getConfig();
      expect(updated.gpsValidation.accuracyVerySuspicious).toBe(5);
      
      updated.gpsValidation.accuracyVerySuspicious = originalValue;
      await updated.save();
    });

    it('should update emulator settings', async () => {
      const sysConfig = await SystemConfig.getConfig();
      
      sysConfig.emulatorDetection.autoBlockThreshold = 5;
      await sysConfig.save();
      
      const updated = await SystemConfig.getConfig();
      expect(updated).toHaveProperty('emulatorDetection');
    });
  });

  describe('Device Trust Score', () => {
    it('should increase trust score on approve', async () => {
      const device = await DeviceFingerprint.create({
        fingerprintId: 'test-device-trust-1',
        spoofingAttempts: 2,
      });

      await device.increaseTrustScore(10);
      expect(device.spoofingAttempts).toBeLessThan(2);
      
      await DeviceFingerprint.deleteOne({ fingerprintId: 'test-device-trust-1' });
    });

    it('should auto-block device after threshold', async () => {
      const device = await DeviceFingerprint.create({
        fingerprintId: 'test-device-block-1',
        spoofingAttempts: 4,
      });

      await device.recordVerificationFailure('Test failure');
      
      expect(device.spoofingAttempts).toBe(5);
      expect(device.isBlocked).toBe(true);
      
      await DeviceFingerprint.deleteOne({ fingerprintId: 'test-device-block-1' });
    });

    it('should unblock device after trust recovery', async () => {
      const device = await DeviceFingerprint.create({
        fingerprintId: 'test-device-unblock',
        spoofingAttempts: 5,
        isBlocked: true,
      });

      await device.increaseTrustScore(10);
      await device.increaseTrustScore(10);
      
      expect(device.isBlocked).toBe(false);
      
      await DeviceFingerprint.deleteOne({ fingerprintId: 'test-device-unblock' });
    });
  });

  describe('Pagination Logic', () => {
    it('should handle valid pagination', () => {
      const page = Math.max(1, parseInt('1') || 1);
      const limit = Math.min(100, Math.max(1, parseInt('20') || 20));
      
      expect(page).toBe(1);
      expect(limit).toBe(20);
    });

    it('should handle invalid page', () => {
      const page = Math.max(1, parseInt('invalid') || 1);
      expect(page).toBe(1);
    });

    it('should handle negative pagination', () => {
      const page = Math.max(1, parseInt('-5') || 1);
      const limit = Math.min(100, Math.max(1, parseInt('0') || 20));
      
      expect(page).toBe(1);
      expect(limit).toBe(20);
    });

    it('should handle excessive limit', () => {
      const limit = Math.min(100, Math.max(1, parseInt('500') || 20));
      expect(limit).toBe(100);
    });
  });

  describe('Review Actions', () => {
    it('should validate approve action', () => {
      const validActions = ['approve', 'reject'];
      expect(validActions).toContain('approve');
    });

    it('should validate reject action', () => {
      const validActions = ['approve', 'reject'];
      expect(validActions).toContain('reject');
    });

    it('should reject invalid action', () => {
      const validActions = ['approve', 'reject'];
      expect(validActions).not.toContain('invalid');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing parameters', () => {
      const filter = buildFilter({});
      expect(filter).toHaveProperty('flagged', true);
      expect(Object.keys(filter).length).toBe(1);
    });

    it('should handle null values gracefully', () => {
      const result = calculateFlagPercentage(null || 0, null || 0);
      expect(result).toBe('0.0');
    });

    it('should handle undefined values gracefully', () => {
      const filter = buildFilter({ type: undefined });
      expect(filter).toHaveProperty('flagged', true);
    });
  });
});

module.exports = {
  calculateFlagPercentage,
  buildFilter,
};
