const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const Location = require('../models/Location');
const { getStorageProvider } = require('../storage');
const { calculateDistance } = require('../utils/geoUtils');

const validateToken = async (req, res) => {
  try {
    const { token } = req.params;
    const tokenHash = Session.hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).populate('locationId', 'name latitude longitude radiusMeters');

    if (!session) {
      return res.status(404).json({
        valid: false,
        message: 'Invalid or expired attendance link',
      });
    }

    if (!session.locationId) {
      return res.status(404).json({
        valid: false,
        message: 'Location not found for this session',
      });
    }

    res.json({
      valid: true,
      session: {
        _id: session._id,
        locationName: session.locationId.name,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUploadUrl = async (req, res) => {
  try {
    const { token } = req.params;
    const tokenHash = Session.hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(404).json({
        message: 'Invalid or expired attendance link',
      });
    }

    const storage = getStorageProvider();
    const key = `${session._id}_${Date.now()}`;
    
    const uploadInfo = await storage.getUploadUrl(key, 'image/jpeg');

    res.json({
      uploadUrl: uploadInfo.uploadUrl,
      publicId: uploadInfo.publicId,
      method: uploadInfo.method,
      headers: uploadInfo.headers || {},
      contentType: uploadInfo.contentType || 'image/jpeg',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const submitAttendance = async (req, res) => {
  try {
    const { token } = req.params;
    const { studentName, rollNumber, photo, latitude, longitude, directUpload = false, publicId = null } = req.body;

    const tokenHash = Session.hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).populate('locationId');

    if (!session) {
      return res.status(404).json({
        message: 'Invalid or expired attendance link',
      });
    }

    if (!session.locationId) {
      return res.status(404).json({
        message: 'Location not found for this session',
      });
    }

    const existingAttendance = await Attendance.findOne({
      sessionId: session._id,
      rollNumber: rollNumber.toUpperCase(),
    });

    if (existingAttendance) {
      return res.status(400).json({
        message: 'Attendance already submitted for this roll number',
      });
    }

    let photoUrl = '';
    let photoPublicId = '';

    const storage = getStorageProvider();

    if (directUpload && publicId) {
      photoUrl = storage.getFileUrl(publicId);
      photoPublicId = publicId;
    } else if (photo) {
      try {
        const uploadResult = await storage.upload(photo, {
          folder: 'attendance-photos',
          key: `${session._id}_${rollNumber}_${Date.now()}`,
        });
        photoUrl = uploadResult.url;
        photoPublicId = uploadResult.publicId;
      } catch (uploadError) {
        return res.status(400).json({
          message: 'Failed to upload photo',
          error: uploadError.message,
        });
      }
    } else {
      return res.status(400).json({
        message: 'Photo is required',
      });
    }

    const distance = calculateDistance(
      latitude,
      longitude,
      session.locationId.latitude,
      session.locationId.longitude
    );

    const isWithinGeofence = distance <= session.locationId.radiusMeters;

    const attendance = await Attendance.create({
      sessionId: session._id,
      studentName,
      rollNumber: rollNumber.toUpperCase(),
      photoUrl,
      photoPublicId,
      studentLatitude: latitude,
      studentLongitude: longitude,
      distanceFromLocation: Math.round(distance),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      verified: isWithinGeofence,
    });

    res.status(201).json({
      message: 'Attendance submitted successfully',
      attendance: {
        _id: attendance._id,
        studentName: attendance.studentName,
        rollNumber: attendance.rollNumber,
        distanceFromLocation: attendance.distanceFromLocation,
        verified: attendance.verified,
        capturedAt: attendance.capturedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Attendance already submitted for this roll number',
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const checkAttendanceStatus = async (req, res) => {
  try {
    const { token } = req.params;
    const { rollNumber } = req.query;

    if (!rollNumber) {
      return res.status(400).json({ message: 'Roll number required' });
    }

    const tokenHash = Session.hashToken(token);

    const session = await Session.findOne({
      tokenHash,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(404).json({
        message: 'Invalid or expired attendance link',
      });
    }

    const existingAttendance = await Attendance.findOne({
      sessionId: session._id,
      rollNumber: rollNumber.toUpperCase(),
    });

    res.json({
      alreadySubmitted: !!existingAttendance,
      attendance: existingAttendance
        ? {
            studentName: existingAttendance.studentName,
            rollNumber: existingAttendance.rollNumber,
            verified: existingAttendance.verified,
            capturedAt: existingAttendance.capturedAt,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getStorageInfo = async (req, res) => {
  try {
    const storage = getStorageProvider();
    res.json({
      provider: storage.getName(),
      supportsDirectUpload: typeof storage.getUploadUrl === 'function',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  validateToken,
  getUploadUrl,
  submitAttendance,
  checkAttendanceStatus,
  getStorageInfo,
};
