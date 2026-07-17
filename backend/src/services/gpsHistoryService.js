const { getRedisClient, isRedisConnected } = require('../config/redis');
const { calculateDistance } = require('../utils/geoUtils');
const logger = require('../utils/logger').child({ module: 'gpsHistoryService' });

const GPS_POSITION_TTL = 300;
const GPS_POSITION_MAX_HISTORY = 20;
const GPS_HISTORY_KEY_PREFIX = 'gps:positions:';

class GPSHistoryService {
  constructor() {
    this.memoryFallback = new Map();
  }

  _getKey(deviceId) {
    return `${GPS_HISTORY_KEY_PREFIX}${deviceId}`;
  }

  async addPosition(deviceId, position) {
    const positionData = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy || null,
      altitude: position.altitude || null,
      speed: position.speed || null,
      timestamp: position.timestamp || Date.now(),
      serverTime: Date.now(),
    };

    try {
      if (isRedisConnected()) {
        const redis = getRedisClient();
        const key = this._getKey(deviceId);

        const historyStr = await redis.get(key);
        let history = historyStr ? JSON.parse(historyStr) : [];

        history.push(positionData);

        if (history.length > GPS_POSITION_MAX_HISTORY) {
          history = history.slice(-GPS_POSITION_MAX_HISTORY);
        }

        await redis.set(key, JSON.stringify(history), 'EX', GPS_POSITION_TTL);

        return history;
      } else {
        return this._addPositionMemory(deviceId, positionData);
      }
    } catch (error) {
      logger.error({ err: error, deviceId }, 'Redis error in addPosition, using memory fallback');
      return this._addPositionMemory(deviceId, positionData);
    }
  }

  _addPositionMemory(deviceId, positionData) {
    let history = this.memoryFallback.get(deviceId) || [];
    history.push(positionData);

    if (history.length > GPS_POSITION_MAX_HISTORY) {
      history = history.slice(-GPS_POSITION_MAX_HISTORY);
    }

    this.memoryFallback.set(deviceId, history);
    return history;
  }

  async getRecentPositions(deviceId, limit = 10) {
    try {
      if (isRedisConnected()) {
        const redis = getRedisClient();
        const key = this._getKey(deviceId);

        const historyStr = await redis.get(key);
        if (!historyStr) return [];

        const history = JSON.parse(historyStr);
        return history.slice(-limit);
      } else {
        const history = this.memoryFallback.get(deviceId) || [];
        return history.slice(-limit);
      }
    } catch (error) {
      logger.error({ err: error, deviceId }, 'Redis error in getRecentPositions');
      return this.memoryFallback.get(deviceId) || [];
    }
  }

  async detectPositionJump(deviceId, newPosition, speedThreshold = 50) {
    const history = await this.getRecentPositions(deviceId, 2);

    if (history.length === 0) {
      return { hasJump: false, anomaly: null };
    }

    const lastPosition = history[history.length - 1];
    const distance = calculateDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      newPosition.latitude,
      newPosition.longitude
    );

    const timeDiff = (Date.now() - lastPosition.serverTime) / 1000;

    if (timeDiff > 0) {
      const speed = distance / timeDiff;

      if (speed > speedThreshold && distance > 100) {
        return {
          hasJump: true,
          anomaly: {
            type: 'POSITION_JUMP',
            severity: 'high',
            details: `Jumped ${distance.toFixed(1)}m in ${timeDiff.toFixed(1)}s (${(speed * 3.6).toFixed(1)} km/h)`,
            distance,
            speed,
            timeDiff,
          },
        };
      }
    }

    return { hasJump: false, anomaly: null };
  }

  async detectAccuracyPattern(deviceId) {
    const history = await this.getRecentPositions(deviceId, 5);

    if (history.length < 3) {
      return { hasPattern: false, anomaly: null };
    }

    const accuracies = history.map(p => p.accuracy).filter(a => a !== null);

    if (accuracies.length < 3) {
      return { hasPattern: false, anomaly: null };
    }

    const allSame = accuracies.every(a => a === accuracies[0]);

    if (allSame) {
      return {
        hasPattern: true,
        anomaly: {
          type: 'ACCURACY_PATTERN',
          severity: 'medium',
          details: `Consistent accuracy of ${accuracies[0]}m across ${accuracies.length} readings (mock GPS pattern)`,
          accuracy: accuracies[0],
          count: accuracies.length,
        },
      };
    }

    const rounded = accuracies.filter(a => a % 1 === 0);
    if (rounded.length === accuracies.length && accuracies.length >= 3) {
      const uniqueRounded = [...new Set(rounded)];
      if (uniqueRounded.length <= 2) {
        return {
          hasPattern: true,
          anomaly: {
            type: 'ACCURACY_PATTERN',
            severity: 'low',
            details: `Rounded accuracy values: ${uniqueRounded.join(', ')}m (possible mock GPS)`,
            accuracies: uniqueRounded,
          },
        };
      }
    }

    return { hasPattern: false, anomaly: null };
  }

  async detectSpeedAnomaly(deviceId, newPosition, speedThreshold = 50) {
    const history = await this.getRecentPositions(deviceId, 5);

    if (history.length < 2) {
      return { hasAnomaly: false, anomaly: null };
    }

    const lastPosition = history[history.length - 1];
    const distance = calculateDistance(
      lastPosition.latitude,
      lastPosition.longitude,
      newPosition.latitude,
      newPosition.longitude
    );

    const timeDiff = (newPosition.serverTime || Date.now()) - lastPosition.serverTime;
    const timeDiffSeconds = timeDiff / 1000;

    if (timeDiffSeconds > 0) {
      const calculatedSpeed = distance / timeDiffSeconds;

      if (calculatedSpeed > speedThreshold) {
        return {
          hasAnomaly: true,
          anomaly: {
            type: 'SPEED_IMPOSSIBLE',
            severity: 'high',
            details: `Impossible speed: ${(calculatedSpeed * 3.6).toFixed(1)} km/h (${calculatedSpeed.toFixed(1)} m/s)`,
            speed: calculatedSpeed,
            distance,
            timeDiff: timeDiffSeconds,
          },
        };
      }
    }

    return { hasAnomaly: false, anomaly: null };
  }

  async clearHistory(deviceId) {
    try {
      if (isRedisConnected()) {
        const redis = getRedisClient();
        const key = this._getKey(deviceId);
        await redis.del(key);
      }
      this.memoryFallback.delete(deviceId);
    } catch (error) {
      logger.error({ err: error, deviceId }, 'Error clearing GPS history');
    }
  }
}

const gpsHistoryService = new GPSHistoryService();

module.exports = {
  GPSHistoryService,
  gpsHistoryService,
  GPS_POSITION_TTL,
  GPS_POSITION_MAX_HISTORY,
};
