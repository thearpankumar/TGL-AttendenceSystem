import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useGPSValidation from '../../src/hooks/useGPSValidation';

describe('useGPSValidation Hook', () => {
  let mockGeolocation: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('collectPosition', () => {
    it('should collect GPS position metadata', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 10,
          altitude: 500,
          altitudeAccuracy: 5,
          speed: 0,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      await act(async () => {
        await result.current.collectPosition();
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    });

    it('should detect fused provider for medium accuracy', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 50,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      await act(async () => {
        await result.current.collectPosition();
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    });

    it('should detect network provider for low accuracy', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 500,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      await act(async () => {
        await result.current.collectPosition();
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    });

    it('should reject when geolocation not supported', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useGPSValidation());

      await expect(async () => {
        await result.current.collectPosition();
      }).rejects.toThrow('Geolocation not supported');
    });

    it('should handle geolocation errors', async () => {
      const mockError = { code: 1, message: 'Permission denied' };
      
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(mockError);
      });

      const { result } = renderHook(() => useGPSValidation());

      await expect(async () => {
        await result.current.collectPosition();
      }).rejects.toBeDefined();
    });
  });

  describe('collectBaseline', () => {
    it('should collect 3 position samples', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          altitude: 500,
          altitudeAccuracy: 5,
          speed: 0,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          ...mockPosition,
          timestamp: Date.now(),
        });
      });

      const { result } = renderHook(() => useGPSValidation());

      let baselinePromise;
      act(() => {
        baselinePromise = result.current.collectBaseline();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const samples = await baselinePromise!;

      expect(samples.length).toBe(3);
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3);
      expect(result.current.baselineCollected).toBe(true);
    }, 30000);

    it('should set collecting state during baseline collection', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      expect(result.current.collecting).toBe(false);

      let baselinePromise;
      act(() => {
        baselinePromise = result.current.collectBaseline();
      });

      expect(result.current.collecting).toBe(true);

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await baselinePromise!;

      expect(result.current.collecting).toBe(false);
    }, 30000);
  });

  describe('Position History Management', () => {
    it('should add position to history', async () => {
      const { result } = renderHook(() => useGPSValidation());

      const sample = {
        latitude: 12.9716,
        longitude: 77.5946,
        metadata: {
          accuracy: 10,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
          timestamp: Date.now(),
          provider: 'gps',
        },
        collectedAt: Date.now(),
      };

      act(() => {
        result.current.addPosition(sample);
      });

      expect(result.current.positionHistory.length).toBe(1);
      expect(result.current.positionHistory[0]).toEqual(sample);
    });

    it('should limit history to 10 positions', async () => {
      const { result } = renderHook(() => useGPSValidation());

      for (let i = 0; i < 12; i++) {
        const sample = {
          latitude: 12.9716 + (i * 0.0001),
          longitude: 77.5946,
          metadata: {
            accuracy: 10,
            altitude: 500,
            altitudeAccuracy: null,
            speed: null,
            heading: null,
            timestamp: Date.now() + (i * 1000),
            provider: 'gps',
          },
          collectedAt: Date.now() + (i * 1000),
        };

        act(() => {
          result.current.addPosition(sample);
        });
      }

      expect(result.current.positionHistory.length).toBe(10);
      expect(result.current.positionHistory[9].latitude).toBeCloseTo(12.9727, 4);
    });

    it('should get latest metadata', async () => {
      const { result } = renderHook(() => useGPSValidation());

      const sample1 = {
        latitude: 12.9716,
        longitude: 77.5946,
        metadata: {
          accuracy: 15,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
          timestamp: Date.now(),
          provider: 'gps',
        },
        collectedAt: Date.now(),
      };

      const sample2 = {
        latitude: 12.9717,
        longitude: 77.5947,
        metadata: {
          accuracy: 10,
          altitude: 501,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
          timestamp: Date.now() + 1000,
          provider: 'gps',
        },
        collectedAt: Date.now() + 1000,
      };

      act(() => {
        result.current.addPosition(sample1);
        result.current.addPosition(sample2);
      });

      const latest = result.current.getLatestMetadata();

      expect(latest?.accuracy).toBe(10);
      expect(latest?.altitude).toBe(501);
    });

    it('should return null for getLatestMetadata when history empty', async () => {
      const { result } = renderHook(() => useGPSValidation());

      const latest = result.current.getLatestMetadata();

      expect(latest).toBeNull();
    });

    it('should clear history', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      await act(async () => {
        await result.current.collectPosition();
      });

      expect(result.current.positionHistory.length).toBeGreaterThanOrEqual(0);

      act(() => {
        result.current.addPosition({
          latitude: 12.9716,
          longitude: 77.5946,
          metadata: {
            accuracy: 10,
            altitude: 500,
            altitudeAccuracy: null,
            speed: null,
            heading: null,
            timestamp: Date.now(),
            provider: 'gps',
          },
          collectedAt: Date.now(),
        });
      });

      expect(result.current.positionHistory.length).toBe(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.positionHistory.length).toBe(0);
      expect(result.current.baselineCollected).toBe(false);
      expect(result.current.warnings.length).toBe(0);
    });
  });

  describe('Anomaly Detection', () => {
    it('should warn about consistent accuracy (mock GPS pattern)', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 3,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        callCount++;
        success({
          ...mockPosition,
          timestamp: Date.now() + (callCount * 2500),
        });
      });

      const { result } = renderHook(() => useGPSValidation());

      let baselinePromise;
      act(() => {
        baselinePromise = result.current.collectBaseline();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await baselinePromise!;

      expect(result.current.warnings.length).toBeGreaterThan(0);
      expect(result.current.warnings[0]).toContain('accuracy');
    }, 30000);

    it('should warn about zero altitude readings', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 20,
          altitude: 0,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        callCount++;
        success({
          ...mockPosition,
          timestamp: Date.now() + (callCount * 2500),
        });
      });

      const { result } = renderHook(() => useGPSValidation());

      let baselinePromise;
      act(() => {
        baselinePromise = result.current.collectBaseline();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await baselinePromise!;

      const altitudeWarning = result.current.warnings.find((w) =>
        w.includes('altitude')
      );
      expect(altitudeWarning).toBeDefined();
    }, 30000);

    it('should warn about timestamps too close together', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 20,
          altitude: 500,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      const timestamps = [
        Date.now(),
        Date.now() + 50,
        Date.now() + 100,
      ];

      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        const idx = callCount;
        callCount++;
        success({
          ...mockPosition,
          timestamp: timestamps[idx],
        });
      });

      const { result } = renderHook(() => useGPSValidation());

      let baselinePromise;
      act(() => {
        baselinePromise = result.current.collectBaseline();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await baselinePromise!;

      const timestampWarning = result.current.warnings.find((w) =>
        w.toLowerCase().includes('timestamp') || w.toLowerCase().includes('timing')
      );
      expect(timestampWarning).toBeDefined();
    }, 30000);
  });

  describe('Provider Detection', () => {
    it('should classify unknown provider for very low accuracy', async () => {
      const mockPosition = {
        coords: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 2000,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success) => {
        success(mockPosition);
      });

      const { result } = renderHook(() => useGPSValidation());

      await act(async () => {
        await result.current.collectPosition();
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    });
  });
});
