const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { validateAttendance } = require('../middleware/validators');
const { studentLimiter } = require('../middleware/rateLimiter');
const { validateDeviceFingerprint, checkRapidSubmission } = require('../middleware/deviceCheck');

router.get('/:token', attendanceController.validateToken);
router.get('/:token/status', attendanceController.checkAttendanceStatus);
router.get('/:token/upload-url', attendanceController.getUploadUrl);
router.get('/:token/captcha', attendanceController.getCaptcha);
router.post('/:token', 
  studentLimiter, 
  validateAttendance, 
  validateDeviceFingerprint, 
  checkRapidSubmission, 
  attendanceController.submitAttendance
);

module.exports = router;
