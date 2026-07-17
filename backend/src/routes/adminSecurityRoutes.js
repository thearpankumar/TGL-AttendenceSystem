const express = require('express');
const router = express.Router();
const adminSecurityController = require('../controllers/adminSecurityController');
const { protect } = require('../middleware/auth');

router.get('/sessions/:sessionId/security-summary', protect, adminSecurityController.getSecuritySummary);
router.get('/sessions/:sessionId/flagged', protect, adminSecurityController.getFlaggedSubmissions);
router.get('/attendance/:attendanceId/details', protect, adminSecurityController.getSubmissionDetails);
router.post('/attendance/:attendanceId/review', protect, adminSecurityController.reviewSubmission);
router.get('/settings', protect, adminSecurityController.getSecuritySettings);
router.put('/settings', protect, adminSecurityController.updateSecuritySettings);

module.exports = router;
