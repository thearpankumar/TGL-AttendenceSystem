const StorageProvider = require('./StorageProvider');
const CloudinaryProvider = require('./CloudinaryProvider');
const S3Provider = require('./S3Provider');
const logger = require('../utils/logger').child({ module: 'storage' });

let storageProvider = null;

function initializeStorage(config) {
  const provider = config.provider || 'cloudinary';

  switch (provider.toLowerCase()) {
    case 's3':
    case 'aws':
      if (!config.s3?.bucket || !config.s3?.accessKeyId || !config.s3?.secretAccessKey) {
        throw new Error('S3 configuration incomplete. Required: bucket, accessKeyId, secretAccessKey');
      }
      storageProvider = new S3Provider(config.s3);
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Storage initialized: AWS S3 (${config.s3.bucket})`);
      }
      break;

    case 'cloudinary':
    default:
      if (!config.cloudinary?.cloudName || !config.cloudinary?.apiKey || !config.cloudinary?.apiSecret) {
        throw new Error('Cloudinary configuration incomplete. Required: cloudName, apiKey, apiSecret');
      }
      storageProvider = new CloudinaryProvider(config.cloudinary);
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Storage initialized: Cloudinary (${config.cloudinary.cloudName})`);
      }
      break;
  }

  return storageProvider;
}

function getStorageProvider() {
  if (!storageProvider) {
    throw new Error('Storage provider not initialized. Call initializeStorage first.');
  }
  return storageProvider;
}

module.exports = {
  initializeStorage,
  getStorageProvider,
  StorageProvider,
  CloudinaryProvider,
  S3Provider,
};
