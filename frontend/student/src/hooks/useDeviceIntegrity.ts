import { useState, useEffect, useCallback } from 'react';

export interface IntegrityCheck {
  type: string;
  details: string;
}

export interface DeviceIntegrityResult {
  passed: boolean;
  checks: IntegrityCheck[];
  timestamp: number;
}

export function useDeviceIntegrity() {
  const [result, setResult] = useState<DeviceIntegrityResult>({
    passed: true,
    checks: [],
    timestamp: Date.now(),
  });
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async (): Promise<DeviceIntegrityResult> => {
    const checks: IntegrityCheck[] = [];

    try {
      const start = performance.now();
      for (let i = 0; i < 100000; i++) {
        Math.random();
      }
      const elapsed = performance.now() - start;

      if (elapsed < 0.5) {
        checks.push({
          type: 'TIMING_MANIPULATION',
          details: `Computation completed in ${elapsed.toFixed(3)}ms (impossibly fast)`,
        });
      }
    } catch {
      // Ignore
    }

    try {
      const ua = navigator.userAgent;
      const claimedMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);

      const maxTouchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints || 0;

      if (claimedMobile && maxTouchPoints === 0) {
        checks.push({
          type: 'POINTER_EVENTS_SUSPICIOUS',
          details: 'Mobile UA but no touch points detected',
        });
      }
    } catch {
      // Ignore
    }

    try {
      const hasWebGL = !!document.createElement('canvas').getContext('webgl');
      const hasCanvas = !!document.createElement('canvas').getContext('2d');

      if (!hasWebGL && !hasCanvas) {
        checks.push({
          type: 'BROWSER_API_INCONSISTENCY',
          details: 'Missing both WebGL and Canvas2D (unusual for modern browser)',
        });
      }
    } catch {
      // Ignore
    }

    try {
      // @ts-expect-error - connection might not be typed
      const connection = navigator.connection;
      if (connection) {
        const type = connection.effectiveType;
        if (type === '4g' || type === '3g') {
          const downlink = connection.downlink;
          if (downlink && downlink > 100) {
            checks.push({
              type: 'BROWSER_API_INCONSISTENCY',
              details: `Unusually high downlink: ${downlink}Mbps`,
            });
          }
        }
      }
    } catch {
      // Ignore
    }

    const passed = checks.length === 0;

    return {
      passed,
      checks,
      timestamp: Date.now(),
    };
  }, []);

  const checkIntegrity = useCallback(async () => {
    setChecking(true);
    try {
      const result = await runChecks();
      setResult(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, [runChecks]);

  useEffect(() => {
    checkIntegrity();
  }, [checkIntegrity]);

  return {
    ...result,
    checking,
    recheck: checkIntegrity,
  };
}

export default useDeviceIntegrity;
