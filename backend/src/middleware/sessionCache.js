const Session = require('../models/Session');
const { isRedisConnected, getRedisClient } = require('../config/redis');
const logger = require('../utils/logger').child({ module: 'sessionCache' });

const SESSION_CACHE_PREFIX = 'session:';
const CACHE_TTL = 300;

async function getCachedSession(tokenHash) {
  if (!isRedisConnected()) {
    return await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate('locationId', 'name latitude longitude radiusMeters');
  }

  const redis = getRedisClient();
  const cacheKey = `${SESSION_CACHE_PREFIX}${tokenHash}`;
  
  try {
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const sessionData = JSON.parse(cached);
      
      if (sessionData.locationId && typeof sessionData.locationId === 'string') {
        return await Session.findOne({
          tokenHash,
          isActive: true,
          expiresAt: { $gt: new Date() }
        }).populate('locationId', 'name latitude longitude radiusMeters');
      }
      
      return sessionData;
    }
    
    const session = await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate('locationId', 'name latitude longitude radiusMeters');
    
    if (session) {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(session.toObject()));
    }
    
    return session;
  } catch (error) {
    logger.error({ err: error }, 'Redis cache read error — falling back to DB');
    
    return await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate('locationId', 'name latitude longitude radiusMeters');
  }
}

async function invalidateSessionCache(tokenHash) {
  if (!isRedisConnected()) {
    return;
  }

  const redis = getRedisClient();
  const cacheKey = `${SESSION_CACHE_PREFIX}${tokenHash}`;
  
  try {
    await redis.del(cacheKey);
    logger.debug({ tokenHashPrefix: tokenHash.substring(0, 8) }, 'Session cache invalidated');
  } catch (error) {
    logger.error({ err: error }, 'Redis cache invalidation error');
  }
}

async function getSessionStats(tokenHash) {
  if (!isRedisConnected()) {
    return { cached: false, source: 'database' };
  }

  const redis = getRedisClient();
  const cacheKey = `${SESSION_CACHE_PREFIX}${tokenHash}`;
  
  try {
    const ttl = await redis.ttl(cacheKey);
    const exists = await redis.exists(cacheKey);
    
    return {
      cached: exists === 1,
      ttl: ttl > 0 ? ttl : 0,
      source: exists === 1 ? 'cache' : 'database'
    };
  } catch (_error) {
    return { cached: false, source: 'database' };
  }
}

module.exports = {
  getCachedSession,
  invalidateSessionCache,
  getSessionStats
};
