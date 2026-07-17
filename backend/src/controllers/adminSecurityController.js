const Attendance = require('../models/Attendance');
const Session = require('../models/Session');
const DeviceFingerprint = require('../models/DeviceFingerprint');
const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger').child({ module: 'adminSecurityController' });

const getSecuritySummary = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const [
      totalSubmissions,
      flaggedSubmissions,
      gpsAnomalyCount,
      emulatorDetectedCount,
      integrityIssueCount,
      confidenceBreakdown,
    ] = await Promise.all([
      Attendance.countDocuments({ sessionId }),
      Attendance.countDocuments({ sessionId, flagged: true }),
      Attendance.countDocuments({ 
        sessionId, 
        'gpsAnomalies.0': { $exists: true },
        flagReviewed: false,
      }),
      Attendance.countDocuments({ 
        sessionId, 
        emulatorDetected: true,
        flagReviewed: false,
      }),
      Attendance.countDocuments({ 
        sessionId, 
        'integrityChecks.0': { $exists: true },
        flagReviewed: false,
      }),
      Attendance.aggregate([
        { $match: { sessionId: session._id } },
        { $group: { _id: '$gpsConfidence', count: { $sum: 1 } } },
      ]),
    ]);

    const gpsAnomalyDetails = await Attendance.find({
      sessionId,
      'gpsAnomalies.0': { $exists: true },
    })
      .select('rollNumber gpsAnomalies gpsConfidence gpsAccuracy flagReviewed')
      .sort({ capturedAt: -1 })
      .limit(50);

    const emulatorDetails = await Attendance.find({
      sessionId,
      emulatorDetected: true,
    })
      .select('rollNumber emulatorFlags flagReviewed')
      .sort({ capturedAt: -1 })
      .limit(50);

    res.json({
      totalSubmissions,
      flaggedSubmissions,
      unreviewedFlags: {
        gpsAnomalies: gpsAnomalyCount,
        emulatorDetected: emulatorDetectedCount,
        integrityIssues: integrityIssueCount,
      },
      flagPercentage: totalSubmissions > 0 
        ? ((flaggedSubmissions / totalSubmissions) * 100).toFixed(1)
        : '0.0',
      confidenceBreakdown: confidenceBreakdown.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {}),
      recentAnomalies: {
        gps: gpsAnomalyDetails,
        emulator: emulatorDetails,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting security summary');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getFlaggedSubmissions = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      reviewed,
      severity,
    } = req.query;

    const query = { sessionId };

    if (reviewed === 'true') {
      query.flagReviewed = true;
    } else if (reviewed === 'false') {
      query.flagReviewed = false;
    }

    if (type === 'gps') {
      query['gpsAnomalies.0'] = { $exists: true };
    } else if (type === 'emulator') {
      query.emulatorDetected = true;
    } else if (type === 'integrity') {
      query['integrityChecks.0'] = { $exists: true };
    }

    if (severity === 'high') {
      query['gpsAnomalies.severity'] = 'high';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [submissions, total] = await Promise.all([
      Attendance.find(query)
        .sort({ capturedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-photoUrl -photoPublicId'),
      Attendance.countDocuments(query),
    ]);

    res.json({
      submissions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting flagged submissions');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const reviewSubmission = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { action, reason } = req.body;
    const adminId = req.admin._id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const previousDeviceFlag = attendance.deviceFlag;
    const wasFlagged = attendance.flagged;

    attendance.flagReviewed = true;
    attendance.flagReviewedBy = adminId;
    attendance.flagReviewedAt = new Date();

    if (action === 'approve') {
      attendance.flagged = false;
      if (attendance.deviceFlag === 'GPS_ANOMALY_DETECTED' ||
          attendance.deviceFlag === 'EMULATOR_DETECTED' ||
          attendance.deviceFlag === 'INTEGRITY_CHECK_FAILED') {
        attendance.deviceFlag = null;
      }

      if (attendance.deviceFingerprint) {
        try {
          const device = await DeviceFingerprint.findOne({ 
            fingerprintId: attendance.deviceFingerprint 
          });
          if (device) {
            const systemConfig = await SystemConfig.getConfig();
            const bonus = systemConfig.trustScore?.safeReviewBonus || 10;
            await device.increaseTrustScore(bonus);
            logger.info(
              { deviceId: device.fingerprintId, bonus, adminId },
              'Device trust score increased after admin approval'
            );
          }
        } catch (deviceError) {
          logger.warn({ err: deviceError }, 'Failed to update device trust score');
        }
      }
    } else {
      attendance.deviceFlag = attendance.deviceFlag || 'ADMIN_REJECTED';
    }

    await attendance.save();

    logger.info(
      {
        attendanceId,
        action,
        reason,
        adminId,
        previousFlag: previousDeviceFlag,
        wasFlagged,
      },
      'Submission reviewed by admin'
    );

    res.json({
      message: `Submission ${action === 'approve' ? 'approved' : 'rejected'}`,
      attendance: {
        _id: attendance._id,
        rollNumber: attendance.rollNumber,
        flagReviewed: attendance.flagReviewed,
        flagged: attendance.flagged,
        deviceFlag: attendance.deviceFlag,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error reviewing submission');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getSecuritySettings = async (req, res) => {
  try {
    const config = await SystemConfig.getConfig();

    res.json({
      gpsValidation: config.gpsValidation || {
        accuracyVerySuspicious: 3,
        accuracySuspicious: 10,
        speedThreshold: 50,
        timestampDriftMax: 60000,
        positionJumpThreshold: 500,
        altitudeZeroPenalty: true,
        enabled: true,
      },
      emulatorDetection: config.emulatorDetection || {
        enabled: true,
        blockOnHighSeverity: false,
      },
      trustScore: config.trustScore || {
        anomalyPenalty: 15,
        safeReviewBonus: 10,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting security settings');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateSecuritySettings = async (req, res) => {
  try {
    const { gpsValidation, emulatorDetection, trustScore } = req.body;
    const adminId = req.admin._id;

    const config = await SystemConfig.getConfig();

    if (gpsValidation) {
      config.gpsValidation = {
        ...config.gpsValidation,
        ...gpsValidation,
      };
    }

    if (emulatorDetection) {
      config.emulatorDetection = {
        ...config.emulatorDetection,
        ...emulatorDetection,
      };
    }

    if (trustScore) {
      config.trustScore = {
        ...config.trustScore,
        ...trustScore,
      };
    }

    config.updatedBy = adminId;
    config.updatedAt = new Date();

    await config.save();

    logger.info(
      { adminId, updates: { gpsValidation, emulatorDetection, trustScore } },
      'Security settings updated'
    );

    res.json({
      message: 'Security settings updated',
      config: {
        gpsValidation: config.gpsValidation,
        emulatorDetection: config.emulatorDetection,
        trustScore: config.trustScore,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating security settings');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getSubmissionDetails = async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const attendance = await Attendance.findById(attendanceId)
      .populate('sessionId', 'locationId')
      .populate('flagReviewedBy', 'username');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const hasSecurityData = 
      (attendance.gpsAnomalies && attendance.gpsAnomalies.length > 0) ||
      (attendance.emulatorFlags && attendance.emulatorFlags.length > 0) ||
      (attendance.integrityChecks && attendance.integrityChecks.length > 0) ||
      attendance.gpsAccuracy !== null;

    res.json({
      attendance: {
        _id: attendance._id,
        rollNumber: attendance.rollNumber,
        studentName: attendance.studentName,
        capturedAt: attendance.capturedAt,
        flagged: attendance.flagged,
        flagReason: attendance.flagReason,
        flagReviewed: attendance.flagReviewed,
        flagReviewedBy: attendance.flagReviewedBy,
        flagReviewedAt: attendance.flagReviewedAt,
      },
      location: {
        latitude: attendance.studentLatitude,
        longitude: attendance.studentLongitude,
        distanceFromLocation: attendance.distanceFromLocation,
      },
      gps: {
        accuracy: attendance.gpsAccuracy,
        altitude: attendance.gpsAltitude,
        speed: attendance.gpsSpeed,
        heading: attendance.gpsHeading,
        provider: attendance.gpsProvider,
        mockLocation: attendance.gpsMockLocation,
        confidence: attendance.gpsConfidence,
        anomalies: attendance.gpsAnomalies || [],
      },
      emulator: {
        detected: attendance.emulatorDetected,
        flags: attendance.emulatorFlags || [],
      },
      integrity: {
        checks: attendance.integrityChecks || [],
      },
      hasSecurityData,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting submission details');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getSecuritySummary,
  getFlaggedSubmissions,
  reviewSubmission,
  getSecuritySettings,
  updateSecuritySettings,
  getSubmissionDetails,
};
