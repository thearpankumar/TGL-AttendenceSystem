const logger = require('../utils/logger').child({ module: 'deviceIntegrity' });

async function checkDeviceIntegrity(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const { integrityChecks: clientChecks } = req.body;

  try {
    const serverChecks = [];

    const start = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) {
      Math.random();
    }
    const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;

    if (elapsed < 0.1) {
      serverChecks.push({
        type: 'TIMING_MANIPULATION',
        details: `Computation completed in ${elapsed.toFixed(3)}ms (impossibly fast)`,
      });
    }

    const userAgent = req.headers['user-agent'] || '';
    const secChUa = req.headers['sec-ch-ua'] || '';
    const secChUaMobile = req.headers['sec-ch-ua-mobile'];

    if (secChUa && secChUaMobile !== undefined) {
      const hasChromePattern = /Chrome|Chromium/.test(secChUa);
      const uaHasChrome = /Chrome|Chromium/.test(userAgent);

      if (hasChromePattern && !uaHasChrome) {
        serverChecks.push({
          type: 'BROWSER_API_INCONSISTENCY',
          details: 'Sec-CH-UA header claims Chrome but UA disagrees',
        });
      }
    }

    const allChecks = [...serverChecks];
    if (clientChecks && Array.isArray(clientChecks)) {
      clientChecks.forEach(check => {
        if (check.type && check.details) {
          allChecks.push({
            type: check.type,
            details: check.details,
          });
        }
      });
    }

    req.deviceIntegrity = {
      checks: allChecks,
      passed: allChecks.length === 0,
    };

    if (allChecks.length > 0) {
      logger.warn(
        {
          requestId: req.id,
          checkCount: allChecks.length,
          checkTypes: allChecks.map(c => c.type),
        },
        'Device integrity issues detected'
      );
    }

    next();
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'Device integrity check error');
    req.deviceIntegrity = {
      checks: [],
      passed: true,
      reason: 'Check failed',
    };
    next();
  }
}

module.exports = {
  checkDeviceIntegrity,
};
