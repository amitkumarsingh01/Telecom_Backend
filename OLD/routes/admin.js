// File: routes/admin.js
const express = require('express');
const { 
  getAllUsers,
  assignStudentsManually,
  assignStudentsAutomatically,
  getSampleExcel
} = require('../controllers/admin');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(authorize('Admin'));

router.get('/users', getAllUsers);
router.post('/assign/manual', assignStudentsManually);
router.post('/assign/automatic', assignStudentsAutomatically);
router.get('/sample-excel', getSampleExcel);

module.exports = router;