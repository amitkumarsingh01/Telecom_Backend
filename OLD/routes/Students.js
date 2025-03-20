// File: routes/students.js
const express = require('express');
const { 
  getStudents, 
  getStudent, 
  createStudent, 
  updateStudent, 
  deleteStudent,
  updateStatus,
  uploadStudents
} = require('../OLD/controllers/students');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();

// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, new Date().toISOString().replace(/:/g, '-') + file.originalname);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.includes('excel') || 
      file.mimetype.includes('spreadsheetml')
    ) {
      cb(null, true);
    } else {
      cb(null, false);
      return cb(new Error('Only Excel format allowed!'));
    }
  }
});

router.route('/')
  .get(protect, getStudents)
  .post(protect, authorize('Admin', 'Agent'), createStudent);

router.route('/:id')
  .get(protect, getStudent)
  .put(protect, authorize('Admin', 'Agent'), updateStudent)
  .delete(protect, authorize('Admin', 'Agent'), deleteStudent);

router.put('/:id/status', protect, authorize('Admin', 'TeleCaller'), updateStatus);
router.post('/upload', protect, authorize('Admin', 'Agent'), upload.single('file'), uploadStudents);

module.exports = router;