// File: controllers/students.js
const Student = require('../models/Student');
const User = require('../models/User');
const XLSX = require('xlsx');
const fs = require('fs');

// @desc    Get all students (filtered by user role)
// @route   GET /api/students
// @access  Private
exports.getStudents = async (req, res) => {
  try {
    let query;

    // For Agents, only show students they created
    if (req.user.userType === 'Agent') {
      query = Student.find({ createdBy: req.user.id });
    } 
    // For TeleCaller, only show students assigned to them
    else if (req.user.userType === 'TeleCaller') {
      query = Student.find({ assignedTo: req.user.id });
    } 
    // For Admin, show all students
    else {
      query = Student.find({});
    }

    // Add pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Student.countDocuments(query);

    query = query.skip(startIndex).limit(limit);

    // Execute query
    const students = await query.populate({
      path: 'createdBy assignedTo',
      select: 'name email userType teleCallerType'
    });

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.status(200).json({
      success: true,
      count: students.length,
      pagination,
      data: students
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
exports.getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate({
      path: 'createdBy assignedTo',
      select: 'name email userType teleCallerType'
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Make sure user has access to the student
    if (
      req.user.userType === 'Agent' && 
      student.createdBy.toString() !== req.user.id &&
      req.user.userType === 'TeleCaller' && 
      student.assignedTo.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to access this student' });
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Create new student
// @route   POST /api/students
// @access  Private (Admin, Agent)
exports.createStudent = async (req, res) => {
  try {
    // Add user to req.body
    req.body.createdBy = req.user.id;

    const student = await Student.create(req.body);

    res.status(201).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin, Agent who created)
exports.updateStudent = async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Make sure user is admin or student owner
    if (
      req.user.userType === 'Agent' && 
      student.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to update this student' });
    }

    // Set updated time
    req.body.updatedAt = Date.now();

    student = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin, Agent who created)
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Make sure user is admin or student owner
    if (
      req.user.userType === 'Agent' && 
      student.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this student' });
    }

    await student.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update student status
// @route   PUT /api/students/:id/status
// @access  Private (Admin, TeleCaller)
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    let student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Make sure user is admin or assigned telecaller
    if (
      req.user.userType === 'TeleCaller' && 
      (!student.assignedTo || student.assignedTo.toString() !== req.user.id)
    ) {
      return res.status(403).json({ message: 'Not authorized to update this student status' });
    }

    student = await Student.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedAt: Date.now()
      },
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Upload students via Excel
// @route   POST /api/students/upload
// @access  Private (Admin, Agent)
exports.uploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ message: 'Excel file is empty' });
    }

    const students = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // Skip if missing essential information
      if (!row.name || !row.email || !row.phoneNumber) {
        continue;
      }

      students.push({
        name: row.name,
        email: row.email,
        phoneNumber: row.phoneNumber,
        description: row.description || '',
        status: row.status || 'pending',
        createdBy: req.user.id
      });
    }

    // Remove file after processing
    fs.unlinkSync(req.file.path);

    // Insert all students at once
    const createdStudents = await Student.insertMany(students);

    res.status(201).json({
      success: true,
      count: createdStudents.length,
      data: createdStudents
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};