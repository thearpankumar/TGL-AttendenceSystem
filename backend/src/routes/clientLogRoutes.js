const express = require('express');
const router = express.Router();
const logger = require('../utils/logger').child({ module: 'clientUI' });
const { clientLogLimiter } = require('../middleware/rateLimiter');

// POST /api/logs/client
router.post('/', clientLogLimiter, (req, res) => {
  try {
    const { message, stack, componentStack, url, userAgent, appName } = req.body;
    
    // Ensure the payload looks like an error log to avoid arbitrary noise
    if (!message && !stack) {
      return res.status(400).json({ error: 'Missing error details' });
    }

    // We use logger.error so this directly triggers the Alloy/Loki error streams
    // and alerts in the Grafana dashboard.
    logger.error({
      clientUrl: url || 'unknown',
      appName: appName || 'unknown',
      clientUserAgent: userAgent || req.headers['user-agent'] || 'unknown',
      clientStack: stack,
      componentStack: componentStack,
      ip: req.ip,
      requestId: req.id
    }, `Client Crash: ${message || 'Unknown Error'}`);

    // Return success to the client without exposing internal details
    res.status(202).json({ success: true });
  } catch (err) {
    logger.warn({ err }, 'Failed to parse client log payload');
    res.status(400).json({ error: 'Invalid payload' });
  }
});

module.exports = router;
