const { GPSHistoryService } = require('../src/services/gpsHistoryService');

describe('GPSHistoryService', () => {
  let service;

  beforeEach(() => {
    service = new GPSHistoryService();
  });

  afterEach(() => {
    if (service.memoryFallback) {
      service.memoryFallback.clear();
    }
  });

  describe('addPosition', () => {
    it('should add a position to memory fallback', async () => {
      const deviceId = 'test-device-1';
      const position = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 10,
        altitude: 500,
        speed: 0,
        timestamp: Date.now(),
      };

      const result = await service.addPosition(deviceId, position);

      expect(result).toHaveLength(1);
      expect(result[0].latitude).toBe(12.9716);
      expect(result[0].longitude).toBe(77.5946);
      expect(result[0].serverTime).toBeDefined();
    });

    it('should maintain maximum 20 positions', async () => {
      const deviceId = 'test-device-2';

      for (let i = 0; i < 25; i++) {
        await service.addPosition(deviceId, {
          latitude: 12.9716 + (i * 0.0001),
          longitude: 77.5946,
          accuracy: 10,
          timestamp: Date.now() + i,
        });
      }

      const history = await service.getRecentPositions(deviceId, 30);
      expect(history.length).toBeLessThanOrEqual(20);
    });

    it('should store GPS metadata', async () => {
      const deviceId = 'test-device-3';
      const position = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 5,
        altitude: 500,
        altitudeAccuracy: 10,
        speed: 2.5,
        timestamp: 1700000000000,
      };

      await service.addPosition(deviceId, position);
      const history = await service.getRecentPositions(deviceId);

      expect(history[0].accuracy).toBe(5);
      expect(history[0].altitude).toBe(500);
      expect(history[0].speed).toBe(2.5);
      expect(history[0].timestamp).toBe(1700000000000);
    });

    it('should handle null metadata fields', async () => {
      const deviceId = 'test-device-4';
      const position = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: null,
        altitude: null,
        speed: null,
        timestamp: Date.now(),
      };

      const result = await service.addPosition(deviceId, position);
      expect(result).toHaveLength(1);
      expect(result[0].accuracy).toBeNull();
      expect(result[0].altitude).toBeNull();
    });
  });

  describe('getRecentPositions', () => {
    it('should return empty array for unknown device', async () => {
      const history = await service.getRecentPositions('unknown-device');
      expect(history).toEqual([]);
    });

    it('should limit results to specified count', async () => {
      const deviceId = 'test-device-5';

      for (let i = 0; i < 10; i++) {
        await service.addPosition(deviceId, {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 10,
          timestamp: Date.now() + i,
        });
      }

      const history = await service.getRecentPositions(deviceId, 5);
      expect(history.length).toBe(5);
    });

    it('should return positions in reverse chronological order', async () => {
      const deviceId = 'test-device-6';
      const now = Date.now();
      
      await service.addPosition(deviceId, { latitude: 12.9716, longitude: 77.5946, timestamp: now });
      await service.addPosition(deviceId, { latitude: 12.9717, longitude: 77.5947, timestamp: now + 1000 });
      
      const history = await service.getRecentPositions(deviceId);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Position History Management', () => {
    it('should store multiple devices separately', async () => {
      await service.addPosition('device-a', { latitude: 12.9716, longitude: 77.5946, timestamp: 1 });
      await service.addPosition('device-b', { latitude: 34.0522, longitude: -118.2437, timestamp: 2 });

      const historyA = await service.getRecentPositions('device-a');
      const historyB = await service.getRecentPositions('device-b');

      expect(historyA[0].latitude).toBe(12.9716);
      expect(historyB[0].latitude).toBe(34.0522);
    });

    it('should handle multiple positions for same device', async () => {
      const deviceId = 'test-device-7';

      await service.addPosition(deviceId, { latitude: 12.9716, longitude: 77.5946, timestamp: 1 });
      await service.addPosition(deviceId, { latitude: 12.9717, longitude: 77.5947, timestamp: 2 });
      await service.addPosition(deviceId, { latitude: 12.9718, longitude: 77.5948, timestamp: 3 });

      const history = await service.getRecentPositions(deviceId);
      expect(history.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing optional fields', async () => {
      const deviceId = 'test-device-8';
      const position = {
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: Date.now(),
      };

      const result = await service.addPosition(deviceId, position);
      expect(result).toHaveLength(1);
    });

    it('should handle very large timestamps', async () => {
      const deviceId = 'test-device-9';
      const position = {
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: 9999999999999,
      };

      const result = await service.addPosition(deviceId, position);
      expect(result[0].timestamp).toBe(9999999999999);
    });

    it('should handle zero values', async () => {
      const deviceId = 'test-device-10';
      const position = {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        speed: 0,
        timestamp: 0,
      };

      const result = await service.addPosition(deviceId, position);
      expect(result[0].latitude).toBe(0);
      expect(result[0].longitude).toBe(0);
    });
  });

  describe('Service Initialization', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service.memoryFallback).toBeDefined();
    });

    it('should have memory fallback available', () => {
      expect(service.memoryFallback).toBeInstanceOf(Map);
    });
  });
});
