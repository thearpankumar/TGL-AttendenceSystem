const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const Batch = require('../models/Batch');
const Location = require('../models/Location');
const { generateToken } = require('../middleware/auth');
const config = require('../config');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const createAdmin = async (req, res) => {
  try {
    const { username, email, password, adminSecret } = req.body;

    if (adminSecret !== config.adminSecret) {
      return res.status(403).json({ message: 'Invalid admin secret' });
    }

    const existingAdmin = await Admin.findOne({
      $or: [{ username }, { email }],
    });

    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const admin = await Admin.create({
      username,
      email,
      password,
    });

    const token = generateToken(admin._id);

    res.status(201).json({
      admin: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (admin.lockUntil && admin.lockUntil > Date.now()) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await admin.matchPassword(password);

    if (!isMatch) {
      // Pipeline update so the increment (and the lock it may trigger) is
      // computed atomically from the document's current state, race-free
      // under concurrent login attempts. Resets to 1 instead of continuing
      // a stale count if the previous lock has already expired.
      const now = new Date();
      await Admin.findOneAndUpdate(
        { _id: admin._id },
        [
          {
            $set: {
              failedLoginAttempts: {
                $cond: [
                  { $and: [{ $ne: ['$lockUntil', null] }, { $lte: ['$lockUntil', now] }] },
                  1,
                  { $add: ['$failedLoginAttempts', 1] },
                ],
              },
            },
          },
          {
            $set: {
              lockUntil: {
                $cond: [
                  { $gte: ['$failedLoginAttempts', MAX_FAILED_LOGIN_ATTEMPTS] },
                  new Date(now.getTime() + LOCK_DURATION_MS),
                  null,
                ],
              },
            },
          },
        ]
      );
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (admin.failedLoginAttempts > 0 || admin.lockUntil) {
      await Admin.updateOne({ _id: admin._id }, { failedLoginAttempts: 0, lockUntil: null });
    }

    const token = generateToken(admin._id);

    res.json({
      _id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    res.json({
      _id: req.admin._id,
      username: req.admin.username,
      email: req.admin.email,
      role: req.admin.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTimeframeRange = (timeframe) => {
  if (!timeframe) return null;
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  const tf = timeframe.toLowerCase();

  if (tf.includes('today')) {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (tf.includes('yesterday')) {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (tf.includes('this week') || tf.includes('week')) {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    end.setDate(diff + 6);
    end.setHours(23, 59, 59, 999);
  } else if (tf.includes('this month') || tf.includes('month')) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else {
    return null;
  }
  return { start, end };
};

const getDashboardStats = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const { batchId, locationId, timeframe, riskLevel } = req.query;
    
    // Parse timeframe filter
    const timeframeRange = getTimeframeRange(timeframe);

    // Construct filter query for Session
    const sessionQuery = { createdBy: adminId };
    if (batchId && batchId !== 'all') {
      sessionQuery.batchId = batchId;
    }
    if (locationId && locationId !== 'all') {
      sessionQuery.locationId = locationId;
    }
    if (timeframeRange) {
      sessionQuery.createdAt = {
        $gte: timeframeRange.start,
        $lte: timeframeRange.end
      };
    }

    // Find all sessions matching filters
    const sessions = await Session.find(sessionQuery).select('_id batchId');
    const sessionIds = sessions.map(s => s._id);

    // If no sessions exist, return a default zeroed payload
    if (sessionIds.length === 0) {
      return res.json({
        pulse: {
          eligibility: { value: 0, target: 90, delta: 0, deltaType: 'up', status: 'On Track' },
          integrity: { value: 0, target: 95, delta: 0, deltaType: 'down', status: 'At Risk' },
          turnout: { value: 0, target: 85, delta: 0, deltaType: 'down', status: 'At Risk' },
          quarantine: { count: 0, status: 'On Track' }
        },
        charts: {
          funnel: { total: 0, onTrack: { count: 0, percentage: 0 }, atRisk: { count: 0, percentage: 0 }, disqualified: { count: 0, percentage: 0 } },
          integrityBreakdown: { totalCheckins: 0, flaggedAnomalies: 0, score: 0, flags: { gpsViolations: { count: 0, percentage: 0 }, deviceAnomalies: { count: 0, percentage: 0 } } },
          weeklyTrends: []
        },
        worklists: { rescueList: [], quarantineList: [], lowBatches: [] },
        lastUpdated: new Date().toISOString()
      });
    }

    const attendanceMatch = { sessionId: { $in: sessionIds } };

    // 1. Pipeline: Funnel & Integrity Breakdown
    const attendanceStats = await Attendance.aggregate([
      { $match: attendanceMatch },
      { $facet: {
          totalCheckins: [{ $count: 'count' }],
          deviceFlags: [
            { $match: { deviceFlag: { $ne: null } } },
            { $count: 'count' }
          ],
          gpsFlags: [
            { $match: { distanceFromLocation: { $gt: 100 } } },
            { $count: 'count' }
          ],
          quarantine: [
            { $match: { verified: false, deviceFlag: { $ne: null } } },
            { $count: 'count' }
          ],
          students: [
            { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 'session' } },
            { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'batches', localField: 'session.batchId', foreignField: '_id', as: 'batch' } },
            { $unwind: { path: '$batch', preserveNullAndEmptyArrays: true } },
            { $group: { _id: { rollNumber: "$rollNumber", name: "$studentName", batch: "$batch.name", batchId: "$batch._id" }, checkins: { $sum: 1 } } }
          ]
      }}
    ]);

    const stats = attendanceStats[0];
    const totalCheckins = stats.totalCheckins[0]?.count || 0;
    const deviceFlagsCount = stats.deviceFlags[0]?.count || 0;
    const gpsFlagsCount = stats.gpsFlags[0]?.count || 0;
    const quarantineCount = stats.quarantine[0]?.count || 0;
    const totalAnomalies = deviceFlagsCount + gpsFlagsCount;
    const integrityScore = totalCheckins > 0 ? Math.round(((totalCheckins - totalAnomalies) / totalCheckins) * 100) : 100;
    
    // Calculate expected checkins dynamically based on the session count for each batch
    // to support dynamic/realistic courses with various lengths.
    const batchSessionCounts = {};
    const batchesForSessions = await Batch.find({ createdBy: adminId }).select('_id');
    for (const b of batchesForSessions) {
      const bIdStr = b._id.toString();
      batchSessionCounts[bIdStr] = sessions.filter(s => s.batchId && s.batchId.toString() === bIdStr).length;
    }

    let onTrackCount = 0, atRiskCount = 0, disqualifiedCount = 0;
    const rescueList = [];

    stats.students.forEach(student => {
      const bIdStr = student._id.batchId ? student._id.batchId.toString() : '';
      const expectedCheckins = batchSessionCounts[bIdStr] || 10;
      const percentage = expectedCheckins > 0 ? (student.checkins / expectedCheckins) * 100 : 0;
      
      const isLowRisk = percentage >= 85;
      const isMediumRisk = percentage >= 75 && percentage < 85;
      const isHighRisk = percentage < 75;

      if (isLowRisk) {
        onTrackCount++;
      } else if (isMediumRisk) {
        atRiskCount++;
      } else {
        disqualifiedCount++;
      }

      // Filter rescueList based on risk level query parameter
      let includeInRescue = false;
      if (!riskLevel || riskLevel === 'All Levels') {
        includeInRescue = isMediumRisk || isHighRisk;
      } else if (riskLevel === 'High Risk' && isHighRisk) {
        includeInRescue = true;
      } else if (riskLevel === 'Medium Risk' && isMediumRisk) {
        includeInRescue = true;
      } else if (riskLevel === 'Low Risk' && isLowRisk) {
        includeInRescue = true;
      }

      if (includeInRescue) {
        rescueList.push({
          rollNo: student._id.rollNumber,
          name: student._id.name,
          batch: student._id.batch || 'N/A',
          attendance: Math.round(percentage),
          trend: isLowRisk ? 'up' : (isMediumRisk ? 'right' : 'down')
        });
      }
    });

    // Sort rescueList by attendance percentage (lowest first)
    rescueList.sort((a, b) => a.attendance - b.attendance);

    const totalStudents = onTrackCount + atRiskCount + disqualifiedCount;
    const avgEligibility = totalStudents > 0 ? Math.round(((onTrackCount + atRiskCount) / totalStudents) * 100) : 0;

    // 2. Pipeline: Weekly Trends
    const weeklyTrendsMatch = { ...attendanceMatch };
    if (!weeklyTrendsMatch.capturedAt) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weeklyTrendsMatch.capturedAt = { $gte: weekAgo };
    }
    const dailyTrends = await Attendance.aggregate([
      { $match: weeklyTrendsMatch },
      { $group: {
          _id: { $dateToString: { format: "%b %d", date: "$capturedAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { "_id": 1 } }
    ]);
    const weeklyTrends = dailyTrends.map(d => ({
      date: d._id, day: d._id, rate: Math.min(Math.round((d.count / (totalStudents || 1)) * 100), 100)
    }));

    // 3. Pipeline: Quarantine Worklist Details (No limit in query, slice in response to allow sorting target records)
    const quarantineMatch = {
      sessionId: { $in: sessionIds },
      verified: false,
      deviceFlag: { $ne: null }
    };
    if (timeframeRange) {
      quarantineMatch.capturedAt = {
        $gte: timeframeRange.start,
        $lte: timeframeRange.end
      };
    }
    const quarantineListRaw = await Attendance.find(quarantineMatch)
      .sort({ capturedAt: -1 })
      .select('rollNumber studentName deviceFlag distanceFromLocation faceDetected');
      
    const quarantineList = quarantineListRaw.map(q => ({
      _id: q._id.toString(),
      rollNo: q.rollNumber,
      name: q.studentName,
      flag: q.deviceFlag,
      distance: Math.round(q.distanceFromLocation),
      face: q.faceDetected ? 'Y' : 'N'
    }));

    // Calculate low engagement batches
    const batchQuery = { createdBy: adminId };
    if (batchId && batchId !== 'all') {
      batchQuery._id = batchId;
    }
    const batches = await Batch.find(batchQuery);
    const lowBatches = [];
    for (const batch of batches) {
      const sessionSubQuery = { batchId: batch._id };
      if (locationId && locationId !== 'all') {
        sessionSubQuery.locationId = locationId;
      }
      const batchSessions = await Session.find(sessionSubQuery);
      if (batchSessions.length === 0) continue;
      const bsIds = batchSessions.map(s => s._id);
      
      const attendanceQuery = { sessionId: { $in: bsIds } };
      if (timeframeRange) {
        attendanceQuery.capturedAt = {
          $gte: timeframeRange.start,
          $lte: timeframeRange.end
        };
      }
      const totalCheckins = await Attendance.countDocuments(attendanceQuery);
      const totalPossible = (batch.students?.length || 0) * batchSessions.length;
      const attendance = totalPossible > 0 ? Math.round((totalCheckins / totalPossible) * 100) : 0;
      
      if (attendance < 80) {
        const latestSession = batchSessions[batchSessions.length - 1];
        const location = latestSession ? await Location.findById(latestSession.locationId) : null;
        const center = location ? location.name : 'Main Campus';
        
        lowBatches.push({
          name: batch.name,
          center,
          trainer: req.admin.username,
          attendance
        });
      }
    }
    
    // Sort low engagement batches by attendance (lowest first)
    lowBatches.sort((a, b) => a.attendance - b.attendance);

    res.json({
      pulse: {
        eligibility: { value: avgEligibility, target: 90, delta: 2, deltaType: 'up', status: avgEligibility >= 85 ? 'On Track' : 'At Risk' },
        integrity: { value: integrityScore, target: 95, delta: 1, deltaType: 'up', status: integrityScore >= 95 ? 'On Track' : 'At Risk' },
        turnout: { value: weeklyTrends.length > 0 ? weeklyTrends[weeklyTrends.length-1].rate : 0, target: 85, delta: 0, deltaType: 'right', status: 'On Track' },
        quarantine: { count: quarantineCount, status: quarantineCount > 0 ? 'Critical' : 'On Track' }
      },
      charts: {
        funnel: {
          total: totalStudents,
          onTrack: { count: onTrackCount, percentage: totalStudents > 0 ? Math.round((onTrackCount/totalStudents)*100) : 0 },
          atRisk: { count: atRiskCount, percentage: totalStudents > 0 ? Math.round((atRiskCount/totalStudents)*100) : 0 },
          disqualified: { count: disqualifiedCount, percentage: totalStudents > 0 ? Math.round((disqualifiedCount/totalStudents)*100) : 0 }
        },
        integrityBreakdown: {
          totalCheckins,
          flaggedAnomalies: totalAnomalies,
          score: integrityScore,
          flags: {
            gpsViolations: { count: gpsFlagsCount, percentage: totalCheckins > 0 ? Math.round((gpsFlagsCount/totalCheckins)*100) : 0 },
            deviceAnomalies: { count: deviceFlagsCount, percentage: totalCheckins > 0 ? Math.round((deviceFlagsCount/totalCheckins)*100) : 0 }
          }
        },
        weeklyTrends: weeklyTrends.length > 0 ? weeklyTrends : [{ date: 'Today', day: 'Today', rate: 0 }]
      },
      worklists: { 
        rescueList: rescueList.slice(0, 10), 
        rescueCount: rescueList.length,
        quarantineList: quarantineList.slice(0, 5), 
        quarantineCount,
        lowBatches: lowBatches.slice(0, 5),
        lowBatchesCount: lowBatches.length
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getRecentActivity = async (req, res) => {
  try {
    const adminSessionIds = await Session.find({ createdBy: req.admin._id }).distinct('_id');
    const records = await Attendance.find({ sessionId: { $in: adminSessionIds } })
      .sort({ capturedAt: -1 })
      .limit(5)
      .populate({ path: 'sessionId', populate: { path: 'locationId', select: 'name' } })
      .select('studentName rollNumber capturedAt verified sessionId');

    const activity = records.map((r) => ({
      studentName: r.studentName,
      rollNumber: r.rollNumber,
      locationName: r.sessionId?.locationId?.name || 'Unknown',
      capturedAt: r.capturedAt,
      verified: r.verified,
    }));

    res.json(activity);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Daily attendance counts per session, scoped to this admin's locations.
// Returns flat rows { date, location, session, count } — the frontend buckets
// these into daily/weekly/monthly and stacks by session.
const getAttendanceSeries = async (req, res) => {
  try {
    const { locationId } = req.query;
    const days = Math.min(parseInt(req.query.days) || 180, 730);
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const locationMatch = { 'location.createdBy': req.admin._id };
    if (locationId) {
      if (!mongoose.Types.ObjectId.isValid(String(locationId))) {
        return res.status(400).json({ message: 'Invalid locationId' });
      }
      locationMatch['location._id'] = new mongoose.Types.ObjectId(String(locationId));
    }

    const rows = await Attendance.aggregate([
      { $match: { capturedAt: { $gte: from } } },
      { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 'session' } },
      { $unwind: '$session' },
      { $lookup: { from: 'locations', localField: 'session.locationId', foreignField: '_id', as: 'location' } },
      { $unwind: '$location' },
      { $match: locationMatch },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt' } },
            session: '$session._id',
          },
          count: { $sum: 1 },
          sessionLabel: { $first: '$session.description' },
          location: { $first: '$location.name' },
        },
      },
      { $sort: { '_id.day': 1 } },
    ]);

    res.json(rows.map((r) => ({
      date: r._id.day,
      location: r.location,
      session: r.sessionLabel || 'Session',
      count: r.count,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Sessions that recorded attendance on a given date (UTC), with student counts.
// Powers the calendar-driven dashboard: pick a date -> see that day's sessions.
const getSessionsByDate = async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return res.status(400).json({ message: 'Valid date (YYYY-MM-DD) required' });
    }

    const rows = await Attendance.aggregate([
      { $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt' } } } },
      { $match: { day: date } },
      { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 'session' } },
      { $unwind: '$session' },
      { $lookup: { from: 'locations', localField: 'session.locationId', foreignField: '_id', as: 'location' } },
      { $unwind: '$location' },
      { $match: { 'location.createdBy': req.admin._id } },
      {
        $group: {
          _id: '$session._id',
          description: { $first: '$session.description' },
          location: { $first: '$location.name' },
          time: { $first: '$session.createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { time: 1 } },
    ]);

    res.json(rows.map((r) => ({
      sessionId: r._id,
      session: r.description || 'Session',
      description: r.description || 'Session',
      location: r.location,
      time: r.time,
      count: r.count,
      date,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDashboardFilters = async (req, res) => {
  try {
    const adminId = req.admin._id;

    const batches = await Batch.find({ createdBy: adminId })
      .select('name')
      .sort({ name: 1 });

    const locations = await Location.find({ createdBy: adminId })
      .select('name')
      .sort({ name: 1 });

    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const formatDateRange = (start, end) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[start.getMonth()]} ${start.getDate()} - ${months[end.getMonth()]} ${end.getDate()}`;
    };

    const formatSingleDate = (date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    };

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const timeframes = [
      `This Week (${formatDateRange(startOfWeek, endOfWeek)})`,
      `Today (${formatSingleDate(today)})`,
      `Yesterday (${formatSingleDate(yesterday)})`,
      `This Month (${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][today.getMonth()]})`,
    ];

    const riskLevels = ['All Levels', 'High Risk', 'Medium Risk', 'Low Risk'];

    res.json({
      batches: [
        { value: 'all', label: 'All Batches' },
        ...batches.map(b => ({ value: b._id.toString(), label: b.name }))
      ],
      centers: [
        { value: 'all', label: 'All Centers' },
        ...locations.map(l => ({ value: l._id.toString(), label: l.name }))
      ],
      timeframes,
      riskLevels,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createAdmin,
  loginAdmin,
  getAdminProfile,
  getDashboardStats,
  getRecentActivity,
  getAttendanceSeries,
  getSessionsByDate,
  getDashboardFilters,
};
