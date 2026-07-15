/**
 * useFaceDetection.ts
 *
 * Lazy-loads @mediapipe/tasks-vision and initialises a BlazeFace short-range
 * detector backed by locally-served WASM (no CDN dependency).
 *
 * Usage:
 *   const { ready, detectFace, error } = useFaceDetection();
 *   const hasFace = await detectFace(canvasElement);
 *
 * Design decisions:
 *   - Singleton detector: the FaceDetector instance is cached at module level
 *     so repeated renders / multiple hooks don't rebuild it.
 *   - Non-blocking: ready starts false; capture is always allowed, with
 *     faceDetected falling back to false if WASM hasn't initialised yet.
 *   - WASM served from /wasm/ (copied from node_modules at build time).
 *   - Model served from /models/blaze_face_short_range.tflite (~225 KB).
 */

import { useState, useEffect, useRef } from 'react';

// ── Module-level singleton ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorInstance: any = null;
let initPromise: Promise<void> | null = null;

async function initDetector(): Promise<void> {
  if (detectorInstance) return;

  // Dynamic import keeps the WASM out of the initial JS bundle
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');

  const vision = await FilesetResolver.forVisionTasks('/wasm');

  detectorInstance = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/blaze_face_short_range.tflite',
      delegate: 'GPU',           // Falls back to CPU automatically if GPU unavailable
    },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5,
    minSuppressionThreshold: 0.3,
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export const useFaceDetection = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!initPromise) {
      initPromise = initDetector();
    }

    initPromise
      .then(() => {
        if (mountedRef.current) setReady(true);
      })
      .catch((err: Error) => {
        if (mountedRef.current) {
          setError(err.message);
          // Reset so next mount can retry
          initPromise = null;
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Runs face detection on a canvas element.
   * Returns true if ≥1 face detected, false otherwise.
   * Returns false (safe fallback) if the detector isn't ready yet.
   */
  const detectFace = async (canvas: HTMLCanvasElement): Promise<boolean> => {
    if (!detectorInstance) return false;
    try {
      const result = detectorInstance.detect(canvas);
      return result.detections.length > 0;
    } catch {
      return false;
    }
  };

  return { ready, detectFace, error };
};
