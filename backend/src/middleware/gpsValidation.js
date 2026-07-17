const gpsHistoryService = require('../services/gpsHistoryService').gpsHistoryService;
const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger').child({ module: 'gpsValidation' });

async function getGPSConfig() {
  try {
    const config = await SystemConfig.getConfig();
    return {
      accuracyVerySuspicious: config.gpsValidation?.accuracyVerySuspicious || 3,
      accuracySuspicious: config.gpsValidation?.accuracySuspicious || 10,
      speedThreshold: config.gpsValidation?.speedThreshold || 50,
      timestampDriftMax: config.gpsValidation?.timestampDriftMax || 60000,
      positionJumpThreshold: config.gpsValidation?.positionJumpThreshold || 500,
      altitudeZeroPenalty: config.gpsValidation?.altitudeZeroPenalty !== false,
      enabled: config.gpsValidation?.enabled !== false,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error loading GPS config, using defaults');
    return {
      accuracyVerySuspicious: 3,
      accuracySuspicious: 10,
      speedThreshold: 50,
      timestampDriftMax: 60000,
      positionJumpThreshold: 500,
      altitudeZeroPenalty: true,
      enabled: true,
    };
  }
}

async function validateGPSPosition(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const {
    latitude,
    longitude,
    gpsMetadata,
    deviceFingerprint,
  } = req.body;

  if (!latitude || !longitude) {
    req.gpsValidation = {
      valid: true,
      anomalies: [],
      confidence: 'medium',
      reason: 'No GPS coordinates provided',
    };
    return next();
  }

  try {
    const config = await getGPSConfig();

    if (!config.enabled) {
      req.gpsValidation = {
        valid: true,
        anomalies: [],
        confidence: 'medium',
        reason: 'GPS validation disabled',
      };
      return next();
    }

    const anomalies = [];
    const deviceId = deviceFingerprint || req.ip || 'unknown';

    if (gpsMetadata) {
      if (gpsMetadata.isMockLocation === true) {
        anomalies.push({
          type: 'CLIENT_REPORTED_MOCK',
          severity: 'high',
          details: 'Client reported mock location',
        });
      }

      if (gpsMetadata.accuracy !== undefined && gpsMetadata.accuracy !== null) {
        if (gpsMetadata.accuracy < config.accuracyVerySuspicious) {
          anomalies.push({
            type: 'ACCURACY_VERY_SUSPICIOUS',
            severity: 'high',
            details: `Accuracy: ${gpsMetadata.accuracy}m (mock GPS often claims <${config.accuracyVerySuspicious}m)`,
          });
        } else if (gpsMetadata.accuracy < config.accuracySuspicious) {
          anomalies.push({
            type: 'ACCURACY_SUSPICIOUS',
            severity: 'medium',
            details: `Accuracy: ${gpsMetadata.accuracy}m (unusually high accuracy)`,
          });
        }
      }

      if (config.altitudeZeroPenalty) {
        if (gpsMetadata.altitude === null || gpsMetadata.altitude === 0) {
          anomalies.push({
            type: 'ALTITUDE_ZERO_OR_NULL',
            severity: 'medium',
            details: 'Zero or null altitude (mock GPS common pattern)',
          });
        }
      }

      if (gpsMetadata.timestamp) {
        const deviceTime = typeof gpsMetadata.timestamp === 'number'
          ? gpsMetadata.timestamp
          : new Date(gpsMetadata.timestamp).getTime();
        const serverTime = Date.now();
        const drift = Math.abs(serverTime - deviceTime);

        if (drift > config.timestampDriftMax) {
          anomalies.push({
            type: 'TIMESTAMP_DRIFT',
            severity: 'medium',
            details: `Device clock drift: ${(drift / 1000).toFixed(1)}s`,
          });
        }
      }

      if (gpsMetadata.provider) {
        const networkProvider = gpsMetadata.provider === 'network';
        const highAccuracy = gpsMetadata.accuracy && gpsMetadata.accuracy < 20;

        if (networkProvider && highAccuracy) {
          anomalies.push({
            type: 'PROVIDER_MISMATCH',
            severity: 'high',
            details: `Network-based location claiming ${gpsMetadata.accuracy}m accuracy (impossible)`,
          });
        }
      }
    }

    const position = {
      latitude,
      longitude,
      accuracy: gpsMetadata?.accuracy,
      altitude: gpsMetadata?.altitude,
      speed: gpsMetadata?.speed,
      timestamp: gpsMetadata?.timestamp || Date.now(),
    };

    await gpsHistoryService.addPosition(deviceId, position);

    const jumpResult = await gpsHistoryService.detectPositionJump(
      deviceId,
      position,
      config.speedThreshold
    );

    if (jumpResult.hasJump) {
      anomalies.push(jumpResult.anomaly);
    }

    const patternResult = await gpsHistoryService.detectAccuracyPattern(deviceId);
    if (patternResult.hasPattern) {
      anomalies.push(patternResult.anomaly);
    }

    const confidence = calculateConfidence(anomalies, gpsMetadata?.isMockLocation);

    req.gpsValidation = {
      valid: true,
      anomalies,
      confidence,
      metadata: gpsMetadata,
    };

    if (anomalies.length > 0) {
      logger.warn(
        {
          requestId: req.id,
          deviceId,
          anomalyCount: anomalies.length,
          anomalyTypes: anomalies.map(a => a.type),
          confidence,
        },
        'GPS anomalies detected'
      );
    }

    next();
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'GPS validation error');
    req.gpsValidation = {
      valid: true,
      anomalies: [],
      confidence: 'medium',
      reason: 'Validation failed, allowing submission',
    };
    next();
  }
}

function calculateConfidence(anomalies, isMockLocation) {
  if (isMockLocation) {
    return 'suspicious';
  }

  const highSeverity = anomalies.filter(a => a.severity === 'high').length;
  const mediumSeverity = anomalies.filter(a => a.severity === 'medium').length;

  if (highSeverity >= 3) {
    return 'suspicious';
  }
  if (highSeverity >= 2) {
    return 'low';
  }
  if (highSeverity >= 1 || mediumSeverity >= 3) {
    return 'low';
  }
  if (mediumSeverity >= 1) {
    return 'medium';
  }

  return 'high';
}

module.exports = {
  validateGPSPosition,
  getGPSConfig,
  calculateConfidence,
};
