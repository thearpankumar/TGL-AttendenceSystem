const mongoose = require('mongoose');

const webAuthnChallengeSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  challenge: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['registration', 'authentication'],
    required: true,
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  shortCode: String,
  studentName: String,
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000),
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
webAuthnChallengeSchema.index({ challenge: 1 });
webAuthnChallengeSchema.index({ studentId: 1, type: 1 });
webAuthnChallengeSchema.index({ sessionId: 1 });

module.exports = mongoose.model('WebAuthnChallenge', webAuthnChallengeSchema);
