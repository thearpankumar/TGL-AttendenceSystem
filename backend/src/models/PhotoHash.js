const mongoose = require('mongoose');

const photoHashSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true },
  photoHash: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  capturedAt: { type: Date, required: true },
  confidence: { type: Number, default: 0 },
  flags: [{
    type: { type: String },
    details: { type: String },
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

photoHashSchema.index({ rollNumber: 1 });
photoHashSchema.index({ rollNumber: 1, sessionId: 1 });
photoHashSchema.index({ photoHash: 1 });

module.exports = mongoose.model('PhotoHash', photoHashSchema);
