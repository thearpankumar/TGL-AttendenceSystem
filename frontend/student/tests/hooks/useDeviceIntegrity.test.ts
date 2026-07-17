import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDeviceIntegrity from '../../src/hooks/useDeviceIntegrity';

const mockDocumentCreateElement = vi.fn();

describe('useDeviceIntegrity Hook', () => {
  let originalNavigator: typeof navigator;
  let originalPerformance: typeof performance;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalNavigator = { ...navigator };
    originalPerformance = { ...performance };
    originalCreateElement = document.createElement.bind(document);

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36',
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with passed true', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      expect(result.current.passed).toBe(true);
      expect(result.current.checks).toEqual([]);

      await act(async () => {
        await vi.runAllTimersAsync();
      });
    });

    it('should run checks on mount', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.timestamp).toBeDefined();
    });
  });

  describe('Timing Manipulation Detection', () => {
    it('should detect impossibly fast computation', async () => {
      const mockPerformance = {
        now: vi.fn()
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(0.1),
      };

      Object.defineProperty(globalThis, 'performance', {
        value: mockPerformance,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const timingCheck = result.current.checks.find(
        (c) => c.type === 'TIMING_MANIPULATION'
      );

      expect(timingCheck?.details).toContain('impossibly fast');
    });

    it('should pass for normal computation speed', async () => {
      const mockPerformance = {
        now: vi.fn()
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(50),
      };

      Object.defineProperty(globalThis, 'performance', {
        value: mockPerformance,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const timingCheck = result.current.checks.find(
        (c) => c.type === 'TIMING_MANIPULATION'
      );

      expect(timingCheck).toBeUndefined();
    });
  });

  describe('Touch Points Detection', () => {
    it('should detect mobile UA with no touch points', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36',
        writable: true,
        configurable: true,
      });

      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const pointerCheck = result.current.checks.find(
        (c) => c.type === 'POINTER_EVENTS_SUSPICIOUS'
      );

      expect(pointerCheck?.details).toContain('no touch points');
    });

    it('should pass for mobile UA with touch points', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36',
        writable: true,
        configurable: true,
      });

      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const pointerCheck = result.current.checks.find(
        (c) => c.type === 'POINTER_EVENTS_SUSPICIOUS'
      );

      expect(pointerCheck).toBeUndefined();
    });

    it('should not flag desktop UA without touch', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36',
        writable: true,
        configurable: true,
      });

      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const pointerCheck = result.current.checks.find(
        (c) => c.type === 'POINTER_EVENTS_SUSPICIOUS'
      );

      expect(pointerCheck).toBeUndefined();
    });
  });

  describe('Result Structure', () => {
    it('should return correct result structure', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current).toHaveProperty('passed');
      expect(result.current).toHaveProperty('checks');
      expect(result.current).toHaveProperty('timestamp');
      expect(result.current).toHaveProperty('checking');
      expect(result.current).toHaveProperty('recheck');
    });

    it('should set passed to false when checks fail', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android) Mobile',
        writable: true,
        configurable: true,
      });

      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.passed).toBe(false);
      expect(result.current.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Manual Recheck', () => {
    it('should allow manual recheck', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const firstTimestamp = result.current.timestamp;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      await act(async () => {
        await result.current.recheck();
      });

      expect(result.current.timestamp).toBeGreaterThanOrEqual(firstTimestamp);
    });

    it('should set checking state during recheck', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      await act(async () => {
        await result.current.recheck();
      });

      expect(result.current.checking).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors gracefully', async () => {
      const { result } = renderHook(() => useDeviceIntegrity());

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.passed).toBeDefined();
      expect(typeof result.current.passed).toBe('boolean');
    });
  });
});
