const mongoose = require('mongoose');
const crypto = require('crypto');

const deviceSchema = new mongoose.Schema({
  fingerprintHash: {
    type: String,
    required: true,
  },
  boundToStudent: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  firstSeenAt: {
    type: Date,
    default: Date.now,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
  attendanceCount: {
    type: Number,
    default: 1,
  },
  flags: [{
    type: {
      type: String,
      enum: [
        'MULTI_STUDENT_DEVICE',
        'STUDENT_DEVICE_SWITCHED',
        'RAPID_SUBMISSION',
        'DEVICE_FINGERPRINT_CHANGE'
      ],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: String,
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
    },
  }],
  metadata: {
    userAgent: String,
    platform: String,
    browser: String,
  },
});

deviceSchema.index({ fingerprintHash: 1, sessionId: 1 });
deviceSchema.index({ boundToStudent: 1, sessionId: 1 });
deviceSchema.index({ fingerprintHash: 1, boundToStudent: 1 });

deviceSchema.statics.hashFingerprint = function(fingerprint) {
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
};

deviceSchema.methods.addFlag = function(flagType, details, sessionId) {
  this.flags.push({
    type: flagType,
    details,
    sessionId,
    timestamp: new Date(),
  });
};

deviceSchema.methods.hasMultiStudentFlag = function() {
  return this.flags.some(f => f.type === 'MULTI_STUDENT_DEVICE');
};

module.exports = mongoose.model('Device', deviceSchema);
