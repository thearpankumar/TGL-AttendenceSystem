const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger').child({ module: 'db' });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      maxPoolSize: parseInt(process.env.MONGODB_POOL_MAX) || 300,
      minPoolSize: parseInt(process.env.MONGODB_POOL_MIN) || 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    mongoose.connection.on('close', () => {
      logger.info('MongoDB: Connection closed');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB: Reconnected');
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB: Disconnected — attempting reconnect');
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    logger.info({ host: conn.connection.host }, 'MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed — exiting');
    process.exit(1);
  }
};

module.exports = connectDB;
