const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const SystemConfig = require('../models/SystemConfig');
const Admin = require('../models/Admin');

// @route   GET /api/config
// @desc    Get system configuration
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({ devBypassEnabled: false });
    }
    res.json(config);
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/config/dev-bypass
// @desc    Toggle Developer Bypass Mode (Requires password)
// @access  Private
router.post('/dev-bypass', protect, async (req, res) => {
  try {
    const { enabled, password } = req.body;

    if (enabled === undefined || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify admin password
    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Update or create config
    let config = await SystemConfig.findOne();
    if (!config) {
      config = new SystemConfig();
    }

    config.devBypassEnabled = Boolean(enabled);
    config.updatedBy = req.admin._id;
    config.updatedAt = Date.now();
    
    await config.save();

    res.json({ message: 'Developer Bypass Mode updated successfully', config });
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
