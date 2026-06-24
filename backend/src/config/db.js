const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      maxPoolSize: parseInt(process.env.MONGODB_POOL_MAX) || 300,
      minPoolSize: parseInt(process.env.MONGODB_POOL_MIN) || 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    mongoose.connection.on('close', () => {
      console.log('MongoDB: Connection closed');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB: Reconnected');
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB: Disconnected - attempting reconnect');
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection pool: ${mongoose.connection.poolSize || 'default'}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
