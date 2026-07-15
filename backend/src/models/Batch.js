const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  rollNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  collegeName: {
    type: String,
    required: false,
    trim: true
  },
  email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true
  }
});

const batchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
  },
  students: [studentSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  }
}, { timestamps: true });

// Optional: Index for fast lookups by admin
batchSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('Batch', batchSchema);
