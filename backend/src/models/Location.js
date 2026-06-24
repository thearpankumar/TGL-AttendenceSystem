const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90,
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180,
  },
  radiusMeters: {
    type: Number,
    required: true,
    default: 100,
    min: 10,
    max: 10000,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

locationSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Location', locationSchema);
