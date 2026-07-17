const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  studentName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  rollNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  photoUrl: {
    type: String,
    required: true,
  },
  photoPublicId: {
    type: String,
    required: true,
  },
  studentLatitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90,
  },
  studentLongitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180,
  },
  distanceFromLocation: {
    type: Number,
    required: true,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  networkProvider: {
    type: String,
  },
  networkOrg: {
    type: String,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  faceDetected: {
    type: Boolean,
    default: true,
  },
  deviceFingerprint: {
    type: String,
    default: null,
  },
  deviceFingerprintHash: {
    type: String,
    default: null,
  },
  deviceFirstSeen: {
    type: Boolean,
    default: false,
  },
  totpCode: {
    type: String,
    default: null,
  },
  totpValid: {
    type: Boolean,
    default: null,
  },
  deviceFlag: {
    type: String,
    enum: [
      null,
      'MULTI_STUDENT_DEVICE',
      'STUDENT_DEVICE_SWITCHED',
      'RAPID_SUBMISSION',
      'DEVICE_FINGERPRINT_CHANGE',
      'WEBAUTHN_REPLAY_ATTACK',
      'WEBAUTHN_NOT_SUPPORTED',
      'WEBAUTHN_CREDENTIAL_SUSPENDED',
      'GPS_ANOMALY_DETECTED',
      'EMULATOR_DETECTED',
      'INTEGRITY_CHECK_FAILED'
    ],
    default: null,
  },
  webauthnCredentialId: {
    type: String,
    default: null,
  },
  webauthnVerified: {
    type: Boolean,
    default: false,
  },
  webauthnDeviceType: {
    type: String,
    enum: [null, 'face_id', 'touch_id', 'fingerprint', 'passkey_fallback', 'unknown'],
    default: null,
  },
  webauthnAuthenticatorAttachment: {
    type: String,
    enum: [null, 'platform', 'cross-platform'],
    default: null,
  },
  webauthnCounter: {
    type: Number,
    default: null,
  },
  webauthnReplayAttack: {
    type: Boolean,
    default: false,
  },
  flagReviewed: {
    type: Boolean,
    default: false,
  },
  flagReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  flagReviewedAt: {
    type: Date,
    default: null,
  },
  flagged: {
    type: Boolean,
    default: false,
  },
  flagReason: {
    type: String,
    default: null,
  },
  flagDetails: {
    type: String,
    default: null,
  },
  capturedAt: {
    type: Date,
    default: Date.now,
  },
  
  // GPS Quality Metadata
  gpsAccuracy: {
    type: Number,
    default: null,
  },
  gpsAltitude: {
    type: Number,
    default: null,
  },
  gpsAltitudeAccuracy: {
    type: Number,
    default: null,
  },
  gpsSpeed: {
    type: Number,
    default: null,
  },
  gpsHeading: {
    type: Number,
    default: null,
  },
  gpsTimestamp: {
    type: Number,
    default: null,
  },
  gpsMockLocation: {
    type: Boolean,
    default: false,
  },
  gpsProvider: {
    type: String,
    enum: [null, 'gps', 'network', 'fused', 'unknown'],
    default: null,
  },
  
  // GPS Anomaly Detection Results
  gpsAnomalies: [{
    type: {
      type: String,
      enum: [
        'ACCURACY_SUSPICIOUS',
        'ACCURACY_VERY_SUSPICIOUS',
        'ALTITUDE_ZERO_OR_NULL',
        'SPEED_IMPOSSIBLE',
        'POSITION_JUMP',
        'TIMESTAMP_DRIFT',
        'ACCURACY_PATTERN',
        'PROVIDER_MISMATCH',
      ],
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    details: String,
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  gpsConfidence: {
    type: String,
    enum: ['high', 'medium', 'low', 'suspicious'],
    default: 'medium',
  },
  
  // Emulator Detection Results
  emulatorDetected: {
    type: Boolean,
    default: false,
  },
  emulatorFlags: [{
    type: {
      type: String,
      enum: [
        'DESKTOP_GPU_DETECTED',
        'AUDIO_FINGERPRINT_EMULATOR',
        'TIMING_ANOMALY',
        'BATTERY_PATTERN_EMULATOR',
        'SCREEN_RESOLUTION_SUSPICIOUS',
        'DEVICE_MEMORY_ROUND',
        'WEBGL_RENDERER_EMULATOR',
        'PLATFORM_INCONSISTENCY',
      ],
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    details: String,
  }],
  
  // Root/Integrity Detection
  integrityChecks: [{
    type: {
      type: String,
      enum: [
        'TIMING_MANIPULATION',
        'BROWSER_API_INCONSISTENCY',
        'POINTER_EVENTS_SUSPICIOUS',
      ],
    },
    details: String,
  }],
});

attendanceSchema.index({ sessionId: 1, rollNumber: 1 }, { unique: true });
attendanceSchema.index({ sessionId: 1, capturedAt: -1 });
attendanceSchema.index({ sessionId: 1, verified: 1 });
attendanceSchema.index({ deviceFlag: 1, flagReviewed: 1 });
attendanceSchema.index({ deviceFingerprintHash: 1 });
attendanceSchema.index({ webauthnVerified: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
