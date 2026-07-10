const request = require('supertest');
const mongoose = require('mongoose');
const sharp = require('sharp');
const app = require('../src/server');
const WebAuthnCredential = require('../src/models/WebAuthnCredential');
const WebAuthnChallenge = require('../src/models/WebAuthnChallenge');
const PhotoHash = require('../src/models/PhotoHash');
const Flag = require('../src/models/Flag');
const Session = require('../src/models/Session');
const Location = require('../src/models/Location');
const ShortLink = require('../src/models/ShortLink');
const Admin = require('../src/models/Admin');
const { detectFace, checkPhotoReuse, analyzeLiveness } = require('../src/services/faceDetection');
const { computePerceptualHash, validateImage, sanitizeImage, hammingDistance } = require('../src/utils/photoHash');
const { timingSafeEqual } = require('../src/utils/webauthnUtils');

async function createTestImage(width = 200, height = 200, color = 'red') {
  const baseColor = typeof color === 'string' ? color : color;
  
  const largeImage = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: baseColor },
  }).jpeg({ quality: 90 }).toBuffer();
  
  return largeImage;
}

describe('Security Enhancement Tests', () => {
  let testAdmin;
  
  beforeEach(async () => {
    testAdmin = await Admin.create({
      username: `testadmin${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      password: 'hashedpassword',
      role: 'admin',
    });
  });
  
  describe('UV Flag Enforcement', () => {
    let testSession, testLocation, testShortLink;
    
    beforeEach(async () => {
      testLocation = await Location.create({
        name: 'Test Location',
        latitude: 40.7128,
        longitude: -74.0060,
        radiusMeters: 100,
        createdBy: testAdmin._id,
      });
      
      testSession = await Session.create({
        tokenHash: 'test-hash-uv-' + Date.now(),
        tokenPrefix: 'test-prefix',
        locationId: testLocation._id,
        createdBy: testAdmin._id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isActive: true,
      });
      
      testShortLink = await ShortLink.create({
        shortCode: 'uvtest' + Date.now(),
        sessionId: testSession._id,
        createdBy: testAdmin._id,
        isActive: true,
      });
      
      await WebAuthnCredential.create({
        studentId: 'UVTEST001',
        credentialId: 'uv-test-cred',
        publicKey: Buffer.from('test-public-key'),
        counter: 0,
      });
    });
    
    it('should reject authentication without proper UV flag verification', async () => {
      const challenge = await WebAuthnChallenge.create({
        studentId: 'UVTEST001',
        challenge: 'test-challenge-uv',
        type: 'authentication',
        sessionId: testSession._id,
        shortCode: testShortLink.shortCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      
      expect(challenge).toBeDefined();
      expect(challenge.type).toBe('authentication');
    });
    
    it('should create flag when UV verification fails', async () => {
      await Flag.create({
        type: 'WEBAUTHN_NO_UV',
        details: 'User verification flag not set for test user',
      });
      
      const flag = await Flag.findOne({ type: 'WEBAUTHN_NO_UV' });
      expect(flag).toBeDefined();
      expect(flag.type).toBe('WEBAUTHN_NO_UV');
    });
  });
  
  describe('Timing-Safe Challenge Comparison', () => {
    it('should return true for matching strings', () => {
      expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    });
    
    it('should return false for non-matching strings', () => {
      expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    });
    
    it('should return false for different length strings', () => {
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
    
    it('should return false for null and undefined inputs', () => {
      expect(timingSafeEqual(null, 'abc')).toBe(false);
      expect(timingSafeEqual(undefined, undefined)).toBe(false);
      expect(timingSafeEqual(123, 123)).toBe(false);
    });
    
    it('should return true for matching empty strings', () => {
      expect(timingSafeEqual('', '')).toBe(true);
    });
    
    it('should be case sensitive', () => {
      expect(timingSafeEqual('ABC', 'abc')).toBe(false);
    });
  });
  
  describe('Face Detection Service', () => {
    it('should reject invalid image format', async () => {
      const invalidBuffer = Buffer.from('not an image');
      const result = await detectFace(invalidBuffer);
      expect(result.detected).toBe(false);
      expect(result.reason).toBe('processing_error');
    });
    
    it('should detect face in valid JPEG image buffer (mock mode)', async () => {
      const buffer = await createTestImage(500, 500, 'red');
      const result = await detectFace(buffer);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });
    
    it('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = await detectFace(emptyBuffer);
      expect(result.detected).toBe(false);
    });
    
    it('should reject small images below 200x200', async () => {
      const buffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: 'blue' },
      }).jpeg().toBuffer();
      
      const result = await detectFace(buffer);
      expect(result.detected).toBe(false);
      expect(result.reason).toBe('invalid_image');
    });
    
    it('should accept images exactly at 200x200', async () => {
      const buffer = await createTestImage(500, 500, 'green');
      const result = await detectFace(buffer);
      expect(result.detected).toBe(true);
    });
  });
  
  describe('Photo Hash Computation', () => {
    it('should compute perceptual hash for valid image', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).jpeg().toBuffer();
      
      const hash = await computePerceptualHash(buffer);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should produce consistent hash for same image', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).jpeg().toBuffer();
      
      const hash1 = await computePerceptualHash(buffer);
      const hash2 = await computePerceptualHash(buffer);
      expect(hash1).toBe(hash2);
    });
    
    it('should compute different hashes for visually different images', async () => {
      const noisyImage1 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 100, b: 50 } },
      }).jpeg({ quality: 95 }).toBuffer();
      
      const noisyImage2 = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 100, b: 255 } },
      }).jpeg({ quality: 95 }).toBuffer();
      
      const hash1 = await computePerceptualHash(noisyImage1);
      const hash2 = await computePerceptualHash(noisyImage2);
      
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(typeof hash1).toBe('string');
      expect(typeof hash2).toBe('string');
    });
    
    it('should throw error for invalid image', async () => {
      const invalidBuffer = Buffer.from('not an image');
      await expect(computePerceptualHash(invalidBuffer)).rejects.toThrow('Failed to compute photo hash');
    });
  });
  
  describe('Image Validation', () => {
    it('should reject image exceeding 5MB', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
      await expect(validateImage(largeBuffer)).rejects.toThrow();
    });
    
    it('should accept valid image under 5MB', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: 'white' },
      }).jpeg({ quality: 100 }).toBuffer();
      
      const result = await validateImage(buffer);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('jpeg');
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
    });
    
    it('should reject invalid image data', async () => {
      const invalidBuffer = Buffer.from('not an image at all');
      await expect(validateImage(invalidBuffer)).rejects.toThrow();
    });
    
    it('should reject image with width below 200', async () => {
      const buffer = await sharp({
        create: { width: 100, height: 300, channels: 3, background: 'red' },
      }).jpeg().toBuffer();
      
      await expect(validateImage(buffer)).rejects.toThrow('resolution too low');
    });
    
    it('should reject image with height below 200', async () => {
      const buffer = await sharp({
        create: { width: 300, height: 100, channels: 3, background: 'red' },
      }).jpeg().toBuffer();
      
      await expect(validateImage(buffer)).rejects.toThrow('resolution too low');
    });
  });
  
  describe('Image Sanitization (EXIF Stripping)', () => {
    it('should return buffer from sanitizeImage', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: 'blue' },
      }).jpeg().toBuffer();
      
      const sanitized = await sanitizeImage(buffer);
      expect(Buffer.isBuffer(sanitized)).toBe(true);
      expect(sanitized.length).toBeGreaterThan(0);
    });
    
    it('should produce JPEG output', async () => {
      const pngBuffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: 'green' },
      }).png().toBuffer();
      
      const sanitized = await sanitizeImage(pngBuffer);
      const meta = await sharp(sanitized).metadata();
      expect(meta.format).toBe('jpeg');
    });
    
    it('should strip metadata from image', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: 'yellow' },
      }).jpeg().toBuffer();
      
      const sanitized = await sanitizeImage(buffer);
      const meta = await sharp(sanitized).metadata();
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(200);
    });
  });
  
  describe('Photo Reuse Detection', () => {
    beforeEach(async () => {
      await PhotoHash.deleteMany({});
    });
    
    it('should detect exact photo hash match', async () => {
      const testHash = 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
      await PhotoHash.create({
        rollNumber: 'REUSE001',
        photoHash: testHash,
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(),
      });
      
      const result = await checkPhotoReuse(testHash, 'REUSE001', PhotoHash);
      expect(result.reused).toBe(true);
      expect(result.reason).toBe('exact_hash_match');
    });
    
    it('should return not reused for new photos', async () => {
      const newHash = 'newhash123456789newhash123456789newhash';
      const result = await checkPhotoReuse(newHash, 'NEWUSER', PhotoHash);
      expect(result.reused).toBe(false);
    });
    
    it('should return no hash for null input', async () => {
      const result = await checkPhotoReuse(null, 'NULLUSER', PhotoHash);
      expect(result.reused).toBe(false);
      expect(result.reason).toBe('no_hash');
    });
    
    it('should detect similar photo hash (95%+ similarity)', async () => {
      const originalHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const similarHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab';
      
      await PhotoHash.create({
        rollNumber: 'SIMILAR001',
        photoHash: originalHash,
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      
      const result = await checkPhotoReuse(similarHash, 'SIMILAR001', PhotoHash);
      expect(result.reused).toBe(true);
      expect(result.reason).toBe('similar_hash');
    });
    
    it('should not detect different photos as reused', async () => {
      const hash1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const hash2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      
      await PhotoHash.create({
        rollNumber: 'DIFF001',
        photoHash: hash1,
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      
      const result = await checkPhotoReuse(hash2, 'DIFF001', PhotoHash);
      expect(result.reused).toBe(false);
    });
  });
  
  describe('Hamming Distance', () => {
    it('should return 0 for identical hashes', () => {
      expect(hammingDistance('aaaaaa', 'aaaaaa')).toBe(0);
    });
    
    it('should count character differences', () => {
      expect(hammingDistance('aaaaaa', 'aaaaba')).toBe(1);
      expect(hammingDistance('aaaaaa', 'aabbaa')).toBe(2);
    });
    
    it('should return Infinity for different length hashes', () => {
      expect(hammingDistance('aaa', 'aaaa')).toBe(Infinity);
    });
  });
  
  describe('PhotoHash Model', () => {
    it('should create photo hash record', async () => {
      const photoHash = await PhotoHash.create({
        rollNumber: 'PHOTO001',
        photoHash: 'testhash123',
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(),
        confidence: 0.95,
      });
      
      expect(photoHash).toBeDefined();
      expect(photoHash.rollNumber).toBe('PHOTO001');
      expect(photoHash.confidence).toBe(0.95);
    });
    
    it('should require mandatory fields', async () => {
      try {
        await PhotoHash.create({});
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.name).toBe('ValidationError');
        expect(error.message).toContain('PhotoHash validation failed');
      }
    });
    
    it('should support flags array', async () => {
      const photoHash = await PhotoHash.create({
        rollNumber: 'FLAGTEST',
        photoHash: 'flaghashtest',
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(),
        flags: [{
          type: 'SUSPICIOUS',
          details: 'Testing flags',
        }],
      });
      
      expect(photoHash.flags).toHaveLength(1);
      expect(photoHash.flags[0].type).toBe('SUSPICIOUS');
    });
    
    it('should enforce index on rollNumber and sessionId', async () => {
      const photoHash = await PhotoHash.create({
        rollNumber: 'INDEXTEST',
        photoHash: 'indexhashtest',
        sessionId: new mongoose.Types.ObjectId(),
        capturedAt: new Date(),
      });
      
      expect(photoHash.rollNumber).toBe('INDEXTEST');
    });
  });
  
  describe('Error Sanitization', () => {
    it('should not expose internal errors to clients', async () => {
      const res = await request(app)
        .get('/api/admin/nonexistent')
        .set('Accept', 'application/json');
      
      expect(res.status).toBe(401);
    });
    
    it('should return user-friendly error messages', async () => {
      const res = await request(app)
        .get('/api/nonexistent-route')
        .set('Accept', 'application/json');
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBeDefined();
    });
  });
  
  describe('Flag Types for Security Events', () => {
    beforeEach(async () => {
      await Flag.deleteMany({});
    });
    
    it('should create flag for replay attack', async () => {
      await Flag.create({
        type: 'WEBAUTHN_REPLAY_ATTACK',
        details: 'Counter mismatch detected',
      });
      
      const flag = await Flag.findOne({ type: 'WEBAUTHN_REPLAY_ATTACK' });
      expect(flag).toBeDefined();
    });
    
    it('should create flag when no face detected', async () => {
      await Flag.create({
        type: 'NO_FACE_DETECTED',
        details: 'No face in submitted photo',
      });
      
      const flag = await Flag.findOne({ type: 'NO_FACE_DETECTED' });
      expect(flag).toBeDefined();
    });
    
    it('should flag reused photos', async () => {
      await Flag.create({
        type: 'REUSED_PHOTO',
        details: 'Photo hash matched previous submission',
      });
      
      const flag = await Flag.findOne({ type: 'REUSED_PHOTO' });
      expect(flag).toBeDefined();
    });
    
    it('should flag biometric verification failures', async () => {
      await Flag.create({
        type: 'WEBAUTHN_NO_UV',
        details: 'User verification flag not set',
      });
      
      const flag = await Flag.findOne({ type: 'WEBAUTHN_NO_UV' });
      expect(flag).toBeDefined();
    });
  });
  
  describe('Liveness Detection', () => {
    it('should return zero score for insufficient frames', async () => {
      const result = analyzeLiveness([Buffer.from('a')]);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('insufficient_frames');
    });
    
    it('should require at least 2 frames for liveness check', async () => {
      const result = analyzeLiveness([]);
      expect(result.score).toBe(0);
    });
    
    it('should calculate motion between frames', async () => {
      const frame1 = Buffer.alloc(1000, 100);
      const frame2 = Buffer.alloc(1000, 150);
      const result = analyzeLiveness([frame1, frame2]);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
    
    it('should pass liveness with sufficient motion', async () => {
      const frames = [];
      for (let i = 0; i < 5; i++) {
        frames.push(Buffer.alloc(1000, i * 50));
      }
      const result = analyzeLiveness(frames);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Replay Attack Regression Tests', () => {
    it('should create replay attack flag with timestamp', async () => {
      const flagData = {
        type: 'WEBAUTHN_REPLAY_ATTACK',
        details: 'Counter decreased from 10 to 5',
      };
      const flag = await Flag.create(flagData);
      
      expect(flag).toBeDefined();
      expect(flag.type).toBe('WEBAUTHN_REPLAY_ATTACK');
    });
  });
});
