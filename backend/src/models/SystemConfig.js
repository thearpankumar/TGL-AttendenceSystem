const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  devBypassEnabled: {
    type: Boolean,
    default: false,
  },
  
  // GPS Validation Configuration
  gpsValidation: {
    accuracyVerySuspicious: {
      type: Number,
      default: 3,
    },
    accuracySuspicious: {
      type: Number,
      default: 10,
    },
    speedThreshold: {
      type: Number,
      default: 50,
    },
    timestampDriftMax: {
      type: Number,
      default: 60000,
    },
    positionJumpThreshold: {
      type: Number,
      default: 500,
    },
    altitudeZeroPenalty: {
      type: Boolean,
      default: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  
  // Emulator Detection Configuration
  emulatorDetection: {
    enabled: {
      type: Boolean,
      default: true,
    },
    blockOnHighSeverity: {
      type: Boolean,
      default: false,
    },
  },
  
  // Device Trust Scoring Configuration
  trustScore: {
    anomalyPenalty: {
      type: Number,
      default: 15,
    },
    safeReviewBonus: {
      type: Number,
      default: 10,
    },
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

systemConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
