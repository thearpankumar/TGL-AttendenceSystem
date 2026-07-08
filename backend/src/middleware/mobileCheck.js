const UAParser = require('ua-parser-js');

function requireMobileDevice(req, res, next) {
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-mobile-check'] !== 'true') {
    return next();
  }

  const userAgent = req.headers['user-agent'] || '';
  const parser = new UAParser(userAgent);
  const deviceType = parser.getDevice().type; // 'mobile', 'tablet', or undefined for desktop

  if (deviceType !== 'mobile' && deviceType !== 'tablet') {
    // If it's an API request (e.g. JSON expected) or submission
    if (req.path.includes('/submit') || req.path.includes('/session') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({
        message: 'Access Denied: This action is only allowed on mobile devices.',
      });
    }

    // For HTML rendering (like the short link redirect /:shortCode)
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mobile Device Required</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 50px 20px; background-color: #f9fafb; color: #111827; }
          .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          h1 { color: #dc2626; margin-top: 0; }
          p { color: #4b5563; line-height: 1.5; }
          .icon { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">📱</div>
          <h1>Mobile Device Required</h1>
          <p>This attendance page is only accessible from mobile devices and tablets.</p>
          <p>Please open this link on your smartphone to mark your attendance.</p>
        </div>
      </body>
      </html>
    `);
  }

  next();
}

module.exports = {
  requireMobileDevice
};
