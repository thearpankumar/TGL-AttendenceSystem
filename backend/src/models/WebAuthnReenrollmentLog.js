const mongoose = require('mongoose');

const webAuthnReenrollmentLogSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  reason: {
    type: String,
    maxlength: 500,
  },
  previousCredentialId: {
    type: String,
  },
  newCredentialId: {
    type: String,
    default: null,
  },
  actionType: {
    type: String,
    enum: ['reset', 'suspend', 'unsuspend'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

webAuthnReenrollmentLogSchema.index({ adminId: 1, timestamp: -1 });
webAuthnReenrollmentLogSchema.index({ studentId: 1, timestamp: -1 });
webAuthnReenrollmentLogSchema.index({ actionType: 1, timestamp: -1 });

module.exports = mongoose.model('WebAuthnReenrollmentLog', webAuthnReenrollmentLogSchema);
