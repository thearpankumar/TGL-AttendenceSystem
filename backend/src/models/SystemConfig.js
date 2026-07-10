const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  devBypassEnabled: {
    type: Boolean,
    default: false,
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

// Since we only ever need one config document for global settings,
// we don't need extensive indexing, but it's good to track who updated it.
module.exports = mongoose.model('SystemConfig', systemConfigSchema);
