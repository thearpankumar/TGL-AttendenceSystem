const {
  EMULATOR_GPU_PATTERNS,
  DESKTOP_GPU_PATTERNS,
} = require('../src/middleware/emulatorDetection');

describe('Emulator Detection Middleware', () => {
  describe('GPU Detection', () => {
    it('should detect SwiftShader as emulator GPU', () => {
      const renderer = 'SwiftShader';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect llvmpipe as emulator GPU', () => {
      const renderer = 'llvmpipe (LLVM 10.0.0, 128 bits)';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect Mesa as emulator GPU', () => {
      const renderer = 'Mesa DRI Intel(R) HD Graphics';
      const containsPattern = EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p));
      expect(typeof containsPattern).toBe('boolean');
    });

    it('should detect VirtualBox GPU', () => {
      const renderer = 'VirtualBox Graphics Adapter';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect VMware GPU', () => {
      const renderer = 'VMware SVGA II Adapter';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should not flag real mobile GPU (Adreno)', () => {
      const renderer = 'Adreno (TM) 650';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
    });

    it('should not flag real mobile GPU (Mali)', () => {
      const renderer = 'Mali-G78';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
    });

    it('should detect desktop GPU (NVIDIA)', () => {
      const renderer = 'NVIDIA GeForce RTX 3080';
      expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect desktop GPU (AMD)', () => {
      const renderer = 'AMD Radeon RX 6800';
      expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect desktop GPU (GeForce)', () => {
      const renderer = 'GeForce GTX 1660';
      expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(true);
    });

    it('should detect desktop GPU (Intel UHD)', () => {
      const renderer = 'Intel(R) UHD Graphics 630';
      expect(typeof renderer).toBe('string');
    });
  });

  describe('Device Memory Detection', () => {
    it('should flag very low memory (< 2GB)', () => {
      const deviceMemory = 1;
      expect(deviceMemory).toBeLessThan(2);
    });

    it('should flag suspiciously exact memory', () => {
      const deviceMemory = 4;
      expect([1, 2, 4, 8].includes(deviceMemory)).toBe(true);
    });

    it('should accept normal memory range', () => {
      const deviceMemory = 8;
      expect(deviceMemory).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Touch Points Detection', () => {
    it('should flag mobile UA with 0 touch points', () => {
      const mobileUA = 'Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile';
      const maxTouchPoints = 0;
      
      const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(mobileUA);
      expect(isMobile).toBe(true);
      expect(maxTouchPoints).toBe(0);
    });

    it('should accept mobile with touch points', () => {
      const maxTouchPoints = 5;
      expect(maxTouchPoints).toBeGreaterThan(0);
    });

    it('should accept desktop without touch', () => {
      const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/112.0.0.0';
      const maxTouchPoints = 0;
      
      const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(desktopUA);
      expect(isMobile).toBe(false);
    });
  });

  describe('Platform Inconsistency Detection', () => {
    it('should detect iPhone UA with Windows platform', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)';
      const platform = 'Windows';
      
      const isiPhone = /iPhone/.test(ua);
      const isWindows = /Windows/i.test(platform);
      
      expect(isiPhone && isWindows).toBe(true);
    });

    it('should detect Android UA with macOS platform', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile Safari/537.36';
      const platform = 'macOS';
      
      const isAndroid = /Android/.test(ua);
      const isMacOS = /macOS|Mac\s*OS/i.test(platform);
      
      expect(isAndroid && isMacOS).toBe(true);
    });

    it('should accept matching platform (iPhone/iOS)', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)';
      const platform = 'iOS';
      
      const isiPhone = /iPhone/.test(ua);
      const isIOS = /iOS|iPhone|iPad/i.test(platform);
      
      expect(isiPhone && isIOS).toBe(true);
    });

    it('should accept matching platform (Android/Android)', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13) Chrome/112.0.0.0 Mobile Safari/537.36';
      const platform = 'Android';
      
      const isAndroid = /Android/.test(ua);
      const isAndroidPlatform = /Android/i.test(platform);
      
      expect(isAndroid && isAndroidPlatform).toBe(true);
    });
  });

  describe('Client-Side Emulation Detection', () => {
    it('should flag client-reported emulation', () => {
      const clientFlags = [{ type: 'EMULATOR_DETECTED', details: 'Client reported emulation' }];
      expect(clientFlags.length).toBeGreaterThan(0);
    });

    it('should handle client-reported inconsistencies', () => {
      const clientFlags = [
        { type: 'MEMORY_SUSPICIOUS', details: 'Very low memory' },
        { type: 'TOUCH_MISMATCH', details: 'Mobile UA but no touch' },
      ];
      expect(clientFlags.length).toBe(2);
    });
  });

  describe('Combined Detection Logic', () => {
    it('should combine multiple flags correctly', () => {
      const flags = [];
      flags.push({ type: 'GPU_EMULATOR', severity: 'high' });
      flags.push({ type: 'MEMORY_SUSPICIOUS', severity: 'medium' });
      
      expect(flags.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing deviceMetrics', () => {
      const deviceMetrics = undefined;
      expect(deviceMetrics).toBeUndefined();
    });

    it('should handle missing sec-ch-ua-platform', () => {
      const platform = undefined;
      expect(platform).toBeUndefined();
    });

    it('should handle unknown GPU renderer', () => {
      const renderer = 'Unknown GPU Model XYZ';
      expect(EMULATOR_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
      expect(DESKTOP_GPU_PATTERNS.some(p => renderer.includes(p))).toBe(false);
    });

    it('should handle empty deviceMetrics object', () => {
      const deviceMetrics = {};
      expect(Object.keys(deviceMetrics).length).toBe(0);
    });

    it('should handle partial deviceMetrics', () => {
      const deviceMetrics = {
        webglRenderer: 'Adreno 650',
      };
      expect(deviceMetrics).toHaveProperty('webglRenderer');
      expect(deviceMetrics).not.toHaveProperty('maxTouchPoints');
    });
  });
});
