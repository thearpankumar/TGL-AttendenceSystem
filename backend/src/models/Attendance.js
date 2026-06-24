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
  verified: {
    type: Boolean,
    default: false,
  },
  capturedAt: {
    type: Date,
    default: Date.now,
  },
});

attendanceSchema.index({ sessionId: 1, rollNumber: 1 }, { unique: true });
attendanceSchema.index({ sessionId: 1, capturedAt: -1 });
attendanceSchema.index({ sessionId: 1, verified: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
