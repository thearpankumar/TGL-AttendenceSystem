const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger').child({ module: 'emulatorDetection' });

const EMULATOR_GPU_PATTERNS = [
  'SwiftShader',
  'llvmpipe',
  'Software',
  'Mesa',
  'Gallium',
  'Software Rasterizer',
  'Microsoft Basic Render',
  'VirGL',
  'VMware',
  'VirtualBox',
];

const DESKTOP_GPU_PATTERNS = [
  'NVIDIA',
  'GeForce',
  'RTX',
  'GTX',
  'AMD',
  'Radeon',
  'Arc',
];

async function getEmulatorConfig() {
  try {
    const config = await SystemConfig.getConfig();
    return {
      enabled: config.emulatorDetection?.enabled !== false,
      blockOnHighSeverity: config.emulatorDetection?.blockOnHighSeverity === true,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error loading emulator config, using defaults');
    return {
      enabled: true,
      blockOnHighSeverity: false,
    };
  }
}

async function detectEmulator(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const { emulatorFlags: clientFlags, deviceMetrics } = req.body;

  try {
    const config = await getEmulatorConfig();

    if (!config.enabled) {
      req.emulatorDetection = {
        detected: false,
        flags: [],
        config,
      };
      return next();
    }

    const serverFlags = [];
    const userAgent = req.headers['user-agent'] || '';
    const clientHintPlatform = req.headers['sec-ch-ua-platform'] || '';

    if (deviceMetrics) {
      if (deviceMetrics.webglRenderer) {
        const renderer = deviceMetrics.webglRenderer;

        EMULATOR_GPU_PATTERNS.forEach(pattern => {
          if (renderer.toLowerCase().includes(pattern.toLowerCase())) {
            serverFlags.push({
              type: 'WEBGL_RENDERER_EMULATOR',
              severity: 'high',
              details: `Emulator GPU detected: ${renderer}`,
            });
          }
        });

        const claimsMobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);
        const isDesktopGPU = DESKTOP_GPU_PATTERNS.some(p =>
          renderer.toLowerCase().includes(p.toLowerCase())
        );

        if (claimsMobileUA && isDesktopGPU) {
          serverFlags.push({
            type: 'DESKTOP_GPU_DETECTED',
            severity: 'high',
            details: `Desktop GPU (${renderer}) with mobile User-Agent`,
          });
        }
      }

      if (deviceMetrics.isEmulation === true) {
        serverFlags.push({
          type: 'CLIENT_DETECTED_EMULATION',
          severity: 'medium',
          details: 'Client-side detection reported emulation',
        });
      }

      if (deviceMetrics.inconsistencies && deviceMetrics.inconsistencies.length > 0) {
        deviceMetrics.inconsistencies.forEach(inc => {
          serverFlags.push({
            type: 'PLATFORM_INCONSISTENCY',
            severity: 'medium',
            details: `Client-reported: ${inc}`,
          });
        });
      }

      if (deviceMetrics.deviceMemory) {
        const memory = deviceMetrics.deviceMemory;
        const roundedPatterns = [2, 4, 8, 16, 32];
        if (roundedPatterns.includes(memory)) {
          if (!deviceMetrics.webglRenderer || EMULATOR_GPU_PATTERNS.some(p =>
            deviceMetrics.webglRenderer?.toLowerCase().includes(p.toLowerCase())
          )) {
            serverFlags.push({
              type: 'DEVICE_MEMORY_ROUND',
              severity: 'low',
              details: `Device memory exactly ${memory}GB (emulator pattern)`,
            });
          }
        }
      }

      if (deviceMetrics.maxTouchPoints !== undefined) {
        if (deviceMetrics.maxTouchPoints === 1) {
          const claimsMobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);
          if (claimsMobileUA) {
            serverFlags.push({
              type: 'POINTER_EVENTS_SUSPICIOUS',
              severity: 'low',
              details: 'maxTouchPoints exactly 1 with mobile UA (possible emulator)',
            });
          }
        }
      }
    }

    if (clientHintPlatform && userAgent) {
      const claimsMobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);
      const isDesktopPlatform = /Windows|macOS|Linux|Chrome OS/i.test(clientHintPlatform);

      if (claimsMobileUA && isDesktopPlatform) {
        const alreadyFlagged = serverFlags.some(f =>
          f.type === 'PLATFORM_INCONSISTENCY' || f.type === 'DESKTOP_GPU_DETECTED'
        );
        if (!alreadyFlagged) {
          serverFlags.push({
            type: 'PLATFORM_INCONSISTENCY',
            severity: 'medium',
            details: `Mobile UA with desktop platform header: ${clientHintPlatform}`,
          });
        }
      }
    }

    const allFlags = [...serverFlags];
    if (clientFlags && Array.isArray(clientFlags)) {
      clientFlags.forEach(flag => {
        if (flag.type && flag.details) {
          allFlags.push({
            type: flag.type,
            severity: flag.severity || 'medium',
            details: flag.details,
          });
        }
      });
    }

    const hasHighSeverity = allFlags.some(f => f.severity === 'high');
    const detected = allFlags.length > 0;

    req.emulatorDetection = {
      detected,
      flags: allFlags,
      hasHighSeverity,
      config,
    };

    if (detected) {
      logger.warn(
        {
          requestId: req.id,
          flagCount: allFlags.length,
          flagTypes: allFlags.map(f => f.type),
          hasHighSeverity,
        },
        'Emulator detected'
      );
    }

    next();
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Emulator detection error');
    req.emulatorDetection = {
      detected: false,
      flags: [],
      reason: 'Detection failed',
    };
    next();
  }
}

module.exports = {
  detectEmulator,
  getEmulatorConfig,
  EMULATOR_GPU_PATTERNS,
  DESKTOP_GPU_PATTERNS,
};
