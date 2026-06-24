const StorageProvider = require('../src/storage/StorageProvider');
const CloudinaryProvider = require('../src/storage/CloudinaryProvider');
const S3Provider = require('../src/storage/S3Provider');

describe('StorageProvider Interface', () => {
  test('should throw error for unimplemented methods', async () => {
    const provider = new StorageProvider();
    
    await expect(provider.upload()).rejects.toThrow('Method not implemented');
    await expect(provider.delete()).rejects.toThrow('Method not implemented');
    expect(() => provider.getFileUrl()).toThrow('Method not implemented');
    await expect(provider.getUploadUrl()).rejects.toThrow('Method not implemented');
    expect(() => provider.getName()).toThrow('Method not implemented');
  });
});

describe('CloudinaryProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new CloudinaryProvider({
      cloudName: 'test-cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });
  });

  test('should initialize with config', () => {
    expect(provider.config.cloudName).toBe('test-cloud');
  });

  test('should return correct provider name', () => {
    expect(provider.getName()).toBe('cloudinary');
  });

  test('should generate upload URL with required fields', async () => {
    const result = await provider.getUploadUrl('test-key', 'image/jpeg');
    
    expect(result).toHaveProperty('uploadUrl');
    expect(result).toHaveProperty('publicId');
    expect(result).toHaveProperty('params');
    expect(result.params).toHaveProperty('api_key');
    expect(result.params).toHaveProperty('timestamp');
    expect(result.params).toHaveProperty('signature');
    expect(result.method).toBe('POST');
  });

  test('should generate upload URL with correct publicId format', async () => {
    const result = await provider.getUploadUrl('student123', 'image/jpeg');
    
    expect(result.publicId).toBe('attendance-photos/student123');
  });

  test('should generate file URL', () => {
    const url = provider.getFileUrl('attendance-photos/test');
    
    expect(url).toContain('test-cloud');
    expect(url).toContain('attendance-photos/test');
  });
});

describe('S3Provider', () => {
  let provider;

  beforeEach(() => {
    provider = new S3Provider({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
  });

  test('should initialize with config', () => {
    expect(provider.bucket).toBe('test-bucket');
    expect(provider.region).toBe('us-east-1');
  });

  test('should return correct provider name', () => {
    expect(provider.getName()).toBe('s3');
  });

  test('should generate correct file URL', () => {
    const url = provider.getFileUrl('attendance-photos/test.jpg');
    
    expect(url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/attendance-photos/test.jpg');
  });

  test('should generate file URL with custom region', () => {
    const customProvider = new S3Provider({
      bucket: 'test-bucket',
      region: 'eu-west-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    
    const url = customProvider.getFileUrl('test.jpg');
    
    expect(url).toContain('eu-west-1');
  });

  test('should validate required config for upload', async () => {
    await expect(provider.upload(null, {})).rejects.toThrow();
  });

  test('should reject upload with invalid data URL format', async () => {
    const s3Provider = new S3Provider({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    
    await expect(s3Provider.upload('not-a-valid-data-url', {})).rejects.toThrow();
  });

  test('should reject upload with missing file data', async () => {
    const s3Provider = new S3Provider({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    
    await expect(s3Provider.upload(null, {})).rejects.toThrow();
    await expect(s3Provider.upload('', {})).rejects.toThrow();
  });

  test('should have method to generate upload URL', () => {
    expect(typeof provider.getUploadUrl).toBe('function');
    expect(typeof provider.getFileUrl).toBe('function');
    expect(typeof provider.delete).toBe('function');
  });
});

describe('Storage Factory', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('should initialize Cloudinary provider by default', () => {
    const { initializeStorage } = require('../src/storage');
    
    const provider = initializeStorage({
      provider: 'cloudinary',
      cloudinary: {
        cloudName: 'test',
        apiKey: 'test',
        apiSecret: 'test',
      },
    });

    expect(provider.getName()).toBe('cloudinary');
  });

  test('should initialize S3 provider when specified', () => {
    const { initializeStorage } = require('../src/storage');
    
    const provider = initializeStorage({
      provider: 's3',
      s3: {
        bucket: 'test-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    expect(provider.getName()).toBe('s3');
  });

  test('should throw error for missing S3 config', () => {
    const { initializeStorage } = require('../src/storage');
    
    expect(() => initializeStorage({
      provider: 's3',
      s3: {},
    })).toThrow('S3 configuration incomplete');
  });

  test('should throw error for missing Cloudinary config', () => {
    const { initializeStorage } = require('../src/storage');
    
    expect(() => initializeStorage({
      provider: 'cloudinary',
      cloudinary: {},
    })).toThrow('Cloudinary configuration incomplete');
  });
});
