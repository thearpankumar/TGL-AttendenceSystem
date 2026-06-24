const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const connectDB = require('./config/db');
const config = require('./config');
const { initializeStorage } = require('./storage');

const app = express();

connectDB();

initializeStorage(config.storage);

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: config.nodeEnv === 'production' ? ['https://your-domain.com'] : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
    credentials: true,
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/storage-info', (req, res) => {
  const { getStorageProvider } = require('./storage');
  try {
    const storage = getStorageProvider();
    res.json({
      provider: storage.getName(),
      supportsDirectUpload: typeof storage.getUploadUrl === 'function',
    });
  } catch (error) {
    res.json({ provider: 'not-initialized' });
  }
});

app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/attend', require('./routes/studentRoutes'));

app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ 
    message: err.message || 'Something went wrong!',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

module.exports = app;
