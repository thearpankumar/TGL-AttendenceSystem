/**
 * System Health Service
 * Calculates system integrity score based on 4 components (25% each):
 * 1. AI Model (Face Detection)
 * 2. Backend Service (Express + Redis + MongoDB)
 * 3. Student Containers (Docker)
 * 4. Admin Service (Auth + Dashboard)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { isRedisConnected, getRedisClient } = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger').child({ module: 'systemHealth' });

let systemHealthScoreMetric = null;
let systemHealthComponentMetric = null;

if (config.nodeEnv !== 'test') {
  try {
    const promClient = require('prom-client');
    
    systemHealthScoreMetric = new promClient.Gauge({
      name: 'attendix_system_health_score',
      help: 'Overall system health score (0-100) calculated from AI Model, Backend, Student Containers, and Admin Service'
    });
    
    systemHealthComponentMetric = new promClient.Gauge({
      name: 'attendix_system_health_component_score',
      help: 'Individual component health score (0-25 per component)',
      labelNames: ['component']
    });
  } catch {
    // prom-client not available
  }
}

const COMPONENT_WEIGHT = 25;
const MAX_SCORE = 100;

const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

const INTEGRITY_STATUS = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  CRITICAL: 'Critical'
};

function getStatusFromScore(score) {
  if (score >= 85) return INTEGRITY_STATUS.ON_TRACK;
  if (score >= 70) return INTEGRITY_STATUS.AT_RISK;
  return INTEGRITY_STATUS.CRITICAL;
}

async function checkAIModelHealth() {
  const start = Date.now();
  const result = {
    name: 'AI Model',
    healthy: false,
    score: 0,
    weight: COMPONENT_WEIGHT,
    details: {
      modelLoaded: false,
      modelPath: null,
      modelSize: 0,
      error: null
    }
  };

  try {
    const modelPaths = [
      path.join(__dirname, '../../../frontend/student/public/models/blaze_face_short_range.tflite'),
      path.join(__dirname, '../../public/models/blaze_face_short_range.tflite'),
      '/app/public/models/blaze_face_short_range.tflite',
      '/usr/share/nginx/html/models/blaze_face_short_range.tflite'
    ];

    let modelFound = false;
    let modelPath = null;
    let modelSize = 0;

    for (const testPath of modelPaths) {
      try {
        if (fs.existsSync(testPath)) {
          const stats = fs.statSync(testPath);
          if (stats.size > 0) {
            modelFound = true;
            modelPath = testPath;
            modelSize = stats.size;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!modelFound) {
      try {
        const studentContainerURL = process.env.STUDENT_FRONTEND_URL || 'http://student-frontend:80';
        const modelCheckURL = `${studentContainerURL}/models/blaze_face_short_range.tflite`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(modelCheckURL, { 
          method: 'HEAD',
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          modelFound = true;
          modelPath = modelCheckURL;
          const contentLength = response.headers.get('content-length');
          modelSize = contentLength ? parseInt(contentLength, 10) : 0;
        }
      } catch {
        // Container not reachable, use local check result
      }
    }

    const minimalModelSize = 100000;
    const isHealthy = modelFound && modelSize > minimalModelSize;

    result.healthy = isHealthy;
    result.score = isHealthy ? COMPONENT_WEIGHT : 0;
    result.details.modelLoaded = modelFound;
    result.details.modelPath = modelPath;
    result.details.modelSize = modelSize;
    result.details.latency = Date.now() - start;

    if (!modelFound) {
      result.details.error = 'AI model file not found in any expected location';
    } else if (modelSize <= minimalModelSize) {
      result.details.error = `Model file too small (${modelSize} bytes), may be corrupted`;
    }

  } catch (error) {
    result.healthy = false;
    result.score = 0;
    result.details.error = error.message;
    result.details.latency = Date.now() - start;
  }

  return result;
}

async function checkBackendHealth() {
  const start = Date.now();
  const result = {
    name: 'Backend Service',
    healthy: false,
    score: 0,
    weight: COMPONENT_WEIGHT,
    details: {
      express: false,
      redis: false,
      mongodb: false,
      latency: 0,
      error: null
    }
  };

  try {
    let healthyComponents = 0;
    const totalComponents = 3;

    result.details.express = true;
    healthyComponents++;

    const redisConnected = isRedisConnected();
    if (redisConnected) {
      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          await redisClient.ping();
          result.details.redis = true;
          healthyComponents++;
        }
      } catch {
        result.details.redis = false;
      }
    }

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      result.details.mongodb = true;
      healthyComponents++;
    }

    const healthPercentage = healthyComponents / totalComponents;
    
    if (healthPercentage >= 1) {
      result.healthy = true;
      result.score = COMPONENT_WEIGHT;
    } else if (healthPercentage >= 0.66) {
      result.healthy = false;
      result.score = Math.round(COMPONENT_WEIGHT * 0.75);
    } else if (healthPercentage >= 0.33) {
      result.healthy = false;
      result.score = Math.round(COMPONENT_WEIGHT * 0.5);
    } else {
      result.healthy = false;
      result.score = 0;
    }

    result.details.latency = Date.now() - start;

  } catch (error) {
    result.healthy = false;
    result.score = 0;
    result.details.error = error.message;
    result.details.latency = Date.now() - start;
  }

  return result;
}

async function checkStudentContainers() {
  const start = Date.now();
  const result = {
    name: 'Student Containers',
    healthy: false,
    score: 0,
    weight: COMPONENT_WEIGHT,
    details: {
      containers: [],
      healthyCount: 0,
      totalCount: 0,
      error: null
    }
  };

  try {
    const containerNames = process.env.STUDENT_CONTAINER_NAMES
      ? process.env.STUDENT_CONTAINER_NAMES.split(',')
      : ['attendance-student', 'student-frontend'];

    let healthyContainers = 0;
    const containerStatuses = [];

    for (const containerName of containerNames) {
      let containerHealthy = false;
      let status = 'unknown';

      try {
        const containerURL = process.env[`${containerName.toUpperCase().replace(/-/g, '_')}_URL`] 
          || `http://${containerName}:80`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const healthResponse = await fetch(`${containerURL}/health`, {
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);

        if (healthResponse.ok || healthResponse.status === 404) {
          containerHealthy = true;
          status = 'running';
        } else {
          status = `http_${healthResponse.status}`;
        }
      } catch {
        try {
          const studentURL = process.env.STUDENT_FRONTEND_URL || 'http://student-frontend:80';
          
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
          
          const response = await fetch(`${studentURL}/`, {
            method: 'HEAD',
            signal: controller2.signal 
          });
          
          clearTimeout(timeoutId2);

          if (response.status < 500) {
            containerHealthy = true;
            status = 'running';
          } else {
            status = 'error';
          }
        } catch {
          containerHealthy = false;
          status = 'unreachable';
        }
      }

      if (containerHealthy) {
        healthyContainers++;
      }

      containerStatuses.push({
        name: containerName,
        healthy: containerHealthy,
        status
      });
    }

    result.details.containers = containerStatuses;
    result.details.totalCount = containerNames.length;
    result.details.healthyCount = healthyContainers;

    if (healthyContainers === containerNames.length) {
      result.healthy = true;
      result.score = COMPONENT_WEIGHT;
    } else if (healthyContainers > 0) {
      const partialScore = (healthyContainers / containerNames.length) * COMPONENT_WEIGHT;
      result.healthy = false;
      result.score = Math.round(partialScore);
    } else {
      result.healthy = false;
      result.score = 0;
      result.details.error = 'No student containers are reachable';
    }

    result.details.latency = Date.now() - start;

  } catch (error) {
    result.healthy = false;
    result.score = 0;
    result.details.error = error.message;
    result.details.latency = Date.now() - start;
  }

  return result;
}

async function checkAdminService() {
  const start = Date.now();
  const result = {
    name: 'Admin Service',
    healthy: false,
    score: 0,
    weight: COMPONENT_WEIGHT,
    details: {
      authEndpoint: false,
      dashboardEndpoint: false,
      adminCount: 0,
      error: null
    }
  };

  try {
    let healthyComponents = 0;
    const totalComponents = 2;

    const Admin = require('../models/Admin');
    const adminCount = await Admin.countDocuments();
    result.details.adminCount = adminCount;

    if (adminCount > 0) {
      result.details.authEndpoint = true;
      healthyComponents++;
    }

    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        result.details.dashboardEndpoint = true;
        healthyComponents++;
      }
    } catch {
      result.details.dashboardEndpoint = false;
    }

    const healthPercentage = healthyComponents / totalComponents;

    if (healthPercentage >= 1) {
      result.healthy = true;
      result.score = COMPONENT_WEIGHT;
    } else if (healthPercentage >= 0.5) {
      result.healthy = false;
      result.score = Math.round(COMPONENT_WEIGHT * 0.5);
    } else {
      result.healthy = false;
      result.score = 0;
    }

    result.details.latency = Date.now() - start;

  } catch (error) {
    result.healthy = false;
    result.score = 0;
    result.details.error = error.message;
    result.details.latency = Date.now() - start;
  }

  return result;
}

async function getSystemIntegrityScore() {
  const startTime = Date.now();
  logger.debug('Starting system integrity score calculation');
  
  const [aiModel, backend, studentContainers, adminService] = await Promise.all([
    checkAIModelHealth(),
    checkBackendHealth(),
    checkStudentContainers(),
    checkAdminService()
  ]);

  const totalScore = aiModel.score + backend.score + studentContainers.score + adminService.score;
  
  const healthyCount = [aiModel, backend, studentContainers, adminService]
    .filter(c => c.healthy).length;

  let overallStatus = HEALTH_STATUS.HEALTHY;
  if (healthyCount < 4) {
    overallStatus = healthyCount >= 2 ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.UNHEALTHY;
  }

  // Update Prometheus metrics
  if (systemHealthScoreMetric) {
    systemHealthScoreMetric.set(totalScore);
  }
  if (systemHealthComponentMetric) {
    systemHealthComponentMetric.set({ component: 'aiModel' }, aiModel.score);
    systemHealthComponentMetric.set({ component: 'backend' }, backend.score);
    systemHealthComponentMetric.set({ component: 'studentContainers' }, studentContainers.score);
    systemHealthComponentMetric.set({ component: 'adminService' }, adminService.score);
  }

  logger.info({
    score: totalScore,
    status: overallStatus,
    healthyComponents: healthyCount,
    duration: Date.now() - startTime,
    components: {
      aiModel: aiModel.healthy,
      backend: backend.healthy,
      studentContainers: studentContainers.healthy,
      adminService: adminService.healthy
    }
  }, 'System integrity score calculated');

  return {
    score: totalScore,
    status: getStatusFromScore(totalScore),
    healthStatus: overallStatus,
    components: {
      aiModel,
      backend,
      studentContainers,
      adminService
    },
    summary: {
      healthyComponents: healthyCount,
      totalComponents: 4,
      maxScore: MAX_SCORE,
      weightedScore: totalScore
    },
    lastChecked: new Date().toISOString()
  };
}

module.exports = {
  getSystemIntegrityScore,
  checkAIModelHealth,
  checkBackendHealth,
  checkStudentContainers,
  checkAdminService,
  HEALTH_STATUS,
  INTEGRITY_STATUS,
  getStatusFromScore
};
