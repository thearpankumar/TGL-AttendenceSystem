const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const config = require('../config');
const logger = require('../utils/logger').child({ module: 'auth' });

const generateToken = (id) => {
  return jwt.sign({ id }, config.jwtSecret, {
    expiresIn: config.jwtExpire,
  });
};

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      req.admin = await Admin.findById(decoded.id).select('-password');
      
      if (!req.admin) {
        logger.warn({ requestId: req.id, ip: req.ip }, 'Auth failed: admin not found for valid token');
        return res.status(401).json({ message: 'Not authorized, admin not found' });
      }
      
      next();
    } catch (error) {
      logger.warn({ requestId: req.id, ip: req.ip, reason: error.message }, 'Auth failed: token verification failed');
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    logger.warn({ requestId: req.id, ip: req.ip, path: req.path }, 'Auth failed: no token provided');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

module.exports = { generateToken, protect };
