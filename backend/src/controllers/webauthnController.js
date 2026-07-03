const WebAuthnCredential = require('../models/WebAuthnCredential');
const WebAuthnReenrollmentLog = require('../models/WebAuthnReenrollmentLog');
const Flag = require('../models/Flag');

const resetCredential = async (req, res) => {
  try {
    const { rollNumber, reason } = req.body;
    const adminId = req.admin._id;
    
    if (!rollNumber) {
      return res.status(400).json({ message: 'Roll number is required' });
    }
    
    const credential = await WebAuthnCredential.findOne({
      studentId: rollNumber.toUpperCase(),
    });
    
    if (!credential) {
      return res.status(404).json({ message: 'No credential found for this student' });
    }
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentResets = await WebAuthnReenrollmentLog.countDocuments({
      adminId,
      actionType: 'reset',
      timestamp: { $gt: oneHourAgo },
    });
    
    if (recentResets >= 10) {
      await Flag.create({
        type: 'ADMIN_WEBAUTHN_RESET_ABUSE',
        adminId,
        details: `${recentResets} resets in the last hour`,
        timestamp: new Date(),
      });
      
      return res.status(429).json({
        message: 'Unusual reset activity detected. Please confirm this action.',
        requiresConfirmation: true,
        recentCount: recentResets,
      });
    }
    
    await WebAuthnReenrollmentLog.create({
      studentId: rollNumber.toUpperCase(),
      adminId,
      reason: reason || '',
      previousCredentialId: credential.credentialId,
      actionType: 'reset',
      timestamp: new Date(),
    });
    
    await WebAuthnCredential.deleteOne({
      studentId: rollNumber.toUpperCase(),
    });
    
    res.json({
      message: 'Credential reset successfully. Student must re-enroll their device.',
      rollNumber: rollNumber.toUpperCase(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const suspendCredential = async (req, res) => {
  try {
    const { rollNumber, reason } = req.body;
    const adminId = req.admin._id;
    
    if (!rollNumber) {
      return res.status(400).json({ message: 'Roll number is required' });
    }
    
    const credential = await WebAuthnCredential.findOne({
      studentId: rollNumber.toUpperCase(),
    });
    
    if (!credential) {
      return res.status(404).json({ message: 'No credential found for this student' });
    }
    
    credential.isSuspended = true;
    credential.suspendedReason = reason || 'Suspended by admin';
    credential.suspendedAt = new Date();
    credential.suspendedBy = adminId;
    await credential.save();
    
    await WebAuthnReenrollmentLog.create({
      studentId: rollNumber.toUpperCase(),
      adminId,
      reason: reason || '',
      previousCredentialId: credential.credentialId,
      actionType: 'suspend',
      timestamp: new Date(),
    });
    
    res.json({
      message: 'Credential suspended successfully',
      rollNumber: rollNumber.toUpperCase(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const unsuspendCredential = async (req, res) => {
  try {
    const { rollNumber, reason } = req.body;
    const adminId = req.admin._id;
    
    if (!rollNumber) {
      return res.status(400).json({ message: 'Roll number is required' });
    }
    
    const credential = await WebAuthnCredential.findOne({
      studentId: rollNumber.toUpperCase(),
    });
    
    if (!credential) {
      return res.status(404).json({ message: 'No credential found for this student' });
    }
    
    credential.isSuspended = false;
    credential.suspendedReason = null;
    credential.suspendedAt = null;
    credential.suspendedBy = null;
    await credential.save();
    
    await WebAuthnReenrollmentLog.create({
      studentId: rollNumber.toUpperCase(),
      adminId,
      reason: reason || '',
      actionType: 'unsuspend',
      timestamp: new Date(),
    });
    
    res.json({
      message: 'Credential unsuspended successfully',
      rollNumber: rollNumber.toUpperCase(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getCredentials = async (req, res) => {
  try {
    const { page = 1, limit = 20, suspended, search } = req.query;
    
    const query = {};
    
    if (suspended === 'true') {
      query.isSuspended = true;
    } else if (suspended === 'false') {
      query.isSuspended = false;
    }
    
    if (search) {
      query.studentId = { $regex: search.toUpperCase(), $options: 'i' };
    }
    
    const credentials = await WebAuthnCredential.find(query)
      .sort({ enrolledAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select('-publicKey');
    
    const total = await WebAuthnCredential.countDocuments(query);
    
    res.json({
      credentials,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getWebAuthnStats = async (req, res) => {
  try {
    const totalEnrolled = await WebAuthnCredential.countDocuments();
    const suspended = await WebAuthnCredential.countDocuments({ isSuspended: true });
    const active = totalEnrolled - suspended;
    
    const deviceTypes = await WebAuthnCredential.aggregate([
      {
        $group: {
          _id: '$deviceType',
          count: { $sum: 1 },
        },
      },
    ]);
    
    const last7Days = await WebAuthnCredential.countDocuments({
      enrolledAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    
    const last30Days = await WebAuthnCredential.countDocuments({
      enrolledAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    
    const reenrollmentStats = await WebAuthnReenrollmentLog.aggregate([
      {
        $group: {
          _id: '$actionType',
          count: { $sum: 1 },
        },
      },
    ]);
    
    res.json({
      totalEnrolled,
      active,
      suspended,
      deviceTypes: deviceTypes.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {}),
      enrollmentTrends: {
        last7Days,
        last30Days,
      },
      reenrollmentStats: reenrollmentStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  resetCredential,
  suspendCredential,
  unsuspendCredential,
  getCredentials,
  getWebAuthnStats,
};
