const mongoose = require('mongoose');

const flagSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  studentId: {
    type: String,
    trim: true,
    uppercase: true,
  },
  details: String,
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  resolved: {
    type: Boolean,
    default: false,
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  resolvedAt: Date,
});

flagSchema.index({ type: 1, timestamp: -1 });
flagSchema.index({ adminId: 1, timestamp: -1 });
flagSchema.index({ resolved: 1, timestamp: -1 });

module.exports = mongoose.model('Flag', flagSchema);
