const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const Batch = require('../models/Batch');
const Location = require('../models/Location');
const Admin = require('../models/Admin');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/attendance-geotag?replicaSet=rs0';
const adminId = new mongoose.Types.ObjectId('6a55e24614bc8372ada88585');

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // 1. Clear existing collections (retaining admin)
  await Session.deleteMany({});
  await Attendance.deleteMany({});
  await Batch.deleteMany({});
  await Location.deleteMany({});
  console.log('Cleared existing sessions, attendance, batches, and locations.');

  // Ensure Admin exists
  let admin = await Admin.findById(adminId);
  if (!admin) {
    admin = new Admin({
      _id: adminId,
      username: 'admin',
      email: 'admin@attendix.com',
      passwordHash: '$2a$10$xyz', // Dummy hash
      role: 'owner'
    });
    await admin.save();
    console.log('Created admin account.');
  }

  // 2. Create Locations
  const locations = [
    { name: 'Main Campus', latitude: 12.9716, longitude: 77.5946, radiusMeters: 100, createdBy: adminId },
    { name: 'Partner College A', latitude: 12.9720, longitude: 77.5950, radiusMeters: 100, createdBy: adminId },
    { name: 'Partner College B', latitude: 12.9710, longitude: 77.5940, radiusMeters: 100, createdBy: adminId },
    { name: 'Partner College C', latitude: 12.9730, longitude: 77.5960, radiusMeters: 100, createdBy: adminId }
  ];
  const insertedLocations = await Location.insertMany(locations);
  console.log(`Seeded ${insertedLocations.length} locations.`);

  // 3. Create Batches
  const batchData = [
    {
      name: 'Fullstack Java Sept',
      description: 'Java Fullstack course',
      createdBy: adminId,
      students: [
        { name: 'Rohan Mehta', rollNumber: 'SRM24CS101', email: 'rohan@example.com' },
        { name: 'Ananya Singh', rollNumber: 'SRM24CS152', email: 'ananya@example.com' },
        { name: 'Arjun Patel', rollNumber: 'SRM24CS177', email: 'arjun@example.com' }
      ]
    },
    {
      name: 'DSA Oct',
      description: 'Data Structures and Algorithms',
      createdBy: adminId,
      students: [
        { name: 'Vikram Rao', rollNumber: 'SRM24CS087', email: 'vikram@example.com' }
      ]
    },
    {
      name: 'DevOps Sept',
      description: 'DevOps & Cloud Orchestration',
      createdBy: adminId,
      students: [
        { name: 'Neha Kumari', rollNumber: 'SRM24EC033', email: 'neha@example.com' }
      ]
    },
    {
      name: 'Python Nov',
      description: 'Python Programming',
      createdBy: adminId,
      students: []
    },
    {
      name: 'Web Dev Sept',
      description: 'Web Development Basics',
      createdBy: adminId,
      students: []
    }
  ];

  // Fill up students in batches to calculate statistics properly
  for (let i = 0; i < 45; i++) {
    batchData[0].students.push({ name: `Student Java ${i}`, rollNumber: `SRMJAV${i}`, email: `java${i}@example.com` });
    batchData[1].students.push({ name: `Student DSA ${i}`, rollNumber: `SRMDSA${i}`, email: `dsa${i}@example.com` });
    batchData[2].students.push({ name: `Student DevOps ${i}`, rollNumber: `SRMDEVOPS${i}`, email: `devops${i}@example.com` });
    batchData[3].students.push({ name: `Student Python ${i}`, rollNumber: `SRMPYTH${i}`, email: `python${i}@example.com` });
    batchData[4].students.push({ name: `Student WebDev ${i}`, rollNumber: `SRMWEB${i}`, email: `webdev${i}@example.com` });
  }

  const insertedBatches = await Batch.insertMany(batchData);
  console.log(`Seeded ${insertedBatches.length} batches.`);

  // 4. Create Sessions (50 sessions per batch to get precise percentages)
  const sessions = [];
  const now = new Date();
  for (const batch of insertedBatches) {
    // Find matching location
    let loc = insertedLocations[0];
    if (batch.name.includes('Python')) loc = insertedLocations[1];
    else if (batch.name.includes('Data Science')) loc = insertedLocations[2];
    else if (batch.name.includes('Web Dev')) loc = insertedLocations[3];

    for (let sIdx = 0; sIdx < 50; sIdx++) {
      const expiresAt = new Date();
      expiresAt.setDate(now.getDate() - (50 - sIdx));
      
      const token = Session.generateToken();
      const tokenHash = Session.hashToken(token);
      
      sessions.push({
        locationId: loc._id,
        batchId: batch._id,
        tokenHash,
        tokenPrefix: token.substring(0, 4),
        description: `Session ${sIdx + 1} for ${batch.name}`,
        createdBy: adminId,
        isActive: false,
        expiresAt,
        createdAt: expiresAt
      });
    }
  }
  const insertedSessions = await Session.insertMany(sessions);
  console.log(`Seeded ${insertedSessions.length} sessions.`);

  // Group sessions by batchId
  const sessionsByBatch = {};
  insertedSessions.forEach(s => {
    if (!sessionsByBatch[s.batchId]) sessionsByBatch[s.batchId] = [];
    sessionsByBatch[s.batchId].push(s);
  });

  // 5. Seed Attendance records to match mockup statistics exactly
  console.log('Seeding attendance records...');
  
  // Custom target students we want to track
  const targets = [
    { rollNumber: 'SRM24CS101', name: 'Rohan Mehta', batchName: 'Fullstack Java Sept', targetCheckins: 34 }, // 68%
    { rollNumber: 'SRM24CS152', name: 'Ananya Singh', batchName: 'Fullstack Java Sept', targetCheckins: 36 }, // 72%
    { rollNumber: 'SRM24CS177', name: 'Arjun Patel', batchName: 'Fullstack Java Sept', targetCheckins: 39 }, // 78%
    { rollNumber: 'SRM24CS087', name: 'Vikram Rao', batchName: 'DSA Oct', targetCheckins: 37 }, // 74%
    { rollNumber: 'SRM24EC033', name: 'Neha Kumari', batchName: 'DevOps Sept', targetCheckins: 38 } // 76%
  ];

  const attendanceRecords = [];

  for (const target of targets) {
    const batch = insertedBatches.find(b => b.name === target.batchName);
    const bSessions = sessionsByBatch[batch._id];
    
    // Seed exactly targetCheckins
    for (let cIdx = 0; cIdx < target.targetCheckins; cIdx++) {
      const session = bSessions[cIdx];
      attendanceRecords.push({
        sessionId: session._id,
        studentName: target.name,
        rollNumber: target.rollNumber,
        photoUrl: 'https://res.cloudinary.com/dummy/image/upload/v1/attendance.jpg',
        photoPublicId: 'attendance_dummy',
        studentLatitude: 12.9716,
        studentLongitude: 77.5946,
        distanceFromLocation: 12,
        verified: true,
        faceDetected: true,
        capturedAt: session.createdAt
      });
    }
  }

  // Seed remaining students in batches to achieve desired average batch attendance
  // Target percentages:
  // Fullstack Java Sept: 68%
  // DSA Oct: 72%? (Mockup shows DSA Oct students Vikram Rao has 74%, let's make DSA Oct overall 74%)
  // DevOps Sept: 74%
  // Python Nov: 76%
  // Web Dev Sept: 77%
  const batchTargets = {
    'Fullstack Java Sept': 0.68,
    'DSA Oct': 0.72,
    'DevOps Sept': 0.74,
    'Python Nov': 0.76,
    'Web Dev Sept': 0.77
  };

  for (const batch of insertedBatches) {
    const targetPct = batchTargets[batch.name] || 0.85;
    const bSessions = sessionsByBatch[batch._id];
    
    for (const student of batch.students) {
      // Skip target students processed above
      if (['SRM24CS101', 'SRM24CS152', 'SRM24CS177', 'SRM24CS087', 'SRM24EC033'].includes(student.rollNumber)) continue;

      // Determine checkin count for this student
      const checkinCount = Math.round(bSessions.length * targetPct);
      for (let cIdx = 0; cIdx < checkinCount; cIdx++) {
        const session = bSessions[cIdx];
        attendanceRecords.push({
          sessionId: session._id,
          studentName: student.name,
          rollNumber: student.rollNumber,
          photoUrl: 'https://res.cloudinary.com/dummy/image/upload/v1/attendance.jpg',
          photoPublicId: 'attendance_dummy',
          studentLatitude: 12.9716,
          studentLongitude: 77.5946,
          distanceFromLocation: 15,
          verified: true,
          faceDetected: true,
          capturedAt: session.createdAt
        });
      }
    }
  }

  // 6. Seed Security Quarantine list (Suspicious attempts)
  const quarantineData = [
    { rollNumber: 'SRM24CS044', name: 'Manish Yadav', flag: 'STUDENT_DEVICE_SWITCHED', distance: 1245, face: false },
    { rollNumber: 'SRM24CS091', name: 'Pooja Sharma', flag: 'MULTI_STUDENT_DEVICE', distance: 15, face: false },
    { rollNumber: 'SRM24IT066', name: 'Karan Verma', flag: 'MULTI_STUDENT_DEVICE', distance: 10, face: true },
    { rollNumber: 'SRM24CS128', name: 'Deepak Kumar', flag: 'STUDENT_DEVICE_SWITCHED', distance: 982, face: true },
    { rollNumber: 'SRM24CS201', name: 'Simran Kaur', flag: 'MULTI_STUDENT_DEVICE', distance: 12, face: false }
  ];

  const firstBatch = insertedBatches[0];
  const firstBatchSessions = sessionsByBatch[firstBatch._id];
  const qSession = firstBatchSessions[0];

  for (const q of quarantineData) {
    attendanceRecords.push({
      sessionId: qSession._id,
      studentName: q.name,
      rollNumber: q.rollNumber,
      photoUrl: 'https://res.cloudinary.com/dummy/image/upload/v1/attendance.jpg',
      photoPublicId: 'attendance_dummy',
      studentLatitude: 12.9800,
      studentLongitude: 77.6000,
      distanceFromLocation: q.distance,
      verified: false,
      faceDetected: q.face,
      deviceFlag: q.flag,
      capturedAt: new Date()
    });
  }

  // 7. Seed extra records to match the high totals (e.g. 230 on rescue list, 23 on quarantine list)
  // Let's add extra quarantine records
  for (let i = 0; i < 18; i++) {
    attendanceRecords.push({
      sessionId: qSession._id,
      studentName: `Quarantine Student ${i}`,
      rollNumber: `SRMQR${i}`,
      photoUrl: 'https://res.cloudinary.com/dummy/image/upload/v1/attendance.jpg',
      photoPublicId: 'attendance_dummy',
      studentLatitude: 12.9800,
      studentLongitude: 77.6000,
      distanceFromLocation: 500,
      verified: false,
      faceDetected: Math.random() > 0.5,
      deviceFlag: 'MULTI_STUDENT_DEVICE',
      capturedAt: new Date()
    });
  }

  // Let's add some extra low attendance students in rescue list to inflate the counts to 230
  // Since students with < 85% get on the rescue list, let's create a batch with 250 students, all at 70% attendance
  const rescueInflatorBatch = new Batch({
    name: 'Backup Batch',
    description: 'Backup Batch',
    createdBy: adminId,
    students: []
  });
  for (let i = 0; i < 225; i++) {
    rescueInflatorBatch.students.push({ name: `Rescue Student ${i}`, rollNumber: `SRMRSC${i}`, email: `rsc${i}@example.com` });
  }
  await rescueInflatorBatch.save();

  // Create 10 sessions for this rescue batch
  const rescueSessions = [];
  for (let sIdx = 0; sIdx < 10; sIdx++) {
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() - (10 - sIdx));
    const token = Session.generateToken();
    const tokenHash = Session.hashToken(token);
    rescueSessions.push({
      locationId: insertedLocations[0]._id,
      batchId: rescueInflatorBatch._id,
      tokenHash,
      tokenPrefix: token.substring(0, 4),
      description: `Rescue Session ${sIdx + 1}`,
      createdBy: adminId,
      isActive: false,
      expiresAt,
      createdAt: expiresAt
    });
  }
  const insertedRescueSessions = await Session.insertMany(rescueSessions);

  // Each gets 7 check-ins -> 70% attendance -> will be counted in disqualified/atRisk rescue list!
  for (const student of rescueInflatorBatch.students) {
    for (let cIdx = 0; cIdx < 7; cIdx++) {
      attendanceRecords.push({
        sessionId: insertedRescueSessions[cIdx]._id,
        studentName: student.name,
        rollNumber: student.rollNumber,
        photoUrl: 'https://res.cloudinary.com/dummy/image/upload/v1/attendance.jpg',
        photoPublicId: 'attendance_dummy',
        studentLatitude: 12.9716,
        studentLongitude: 77.5946,
        distanceFromLocation: 12,
        verified: true,
        faceDetected: true,
        capturedAt: insertedRescueSessions[cIdx].createdAt
      });
    }
  }

  // Insert all attendance records in chunks
  console.log(`Inserting ${attendanceRecords.length} attendance records into DB...`);
  const chunkSize = 1000;
  for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
    const chunk = attendanceRecords.slice(i, i + chunkSize);
    await Attendance.insertMany(chunk);
  }
  console.log('Seeding finished successfully!');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
