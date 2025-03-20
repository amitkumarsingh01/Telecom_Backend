// File: controllers/admin.js
const User = require('../models/User');
const Student = require('../models/Student');
const XLSX = require('xlsx');
const path = require('path');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({});

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Assign students to telecallers manually
// @route   POST /api/admin/assign/manual
// @access  Private (Admin)
exports.assignStudentsManually = async (req, res) => {
  try {
    const { studentIds, teleCallerId } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || !teleCallerId) {
      return res.status(400).json({ message: 'Please provide studentIds array and teleCallerId' });
    }

    // Check if telecaller exists
    const telecaller = await User.findOne({ 
      _id: teleCallerId,
      userType: 'TeleCaller'
    });

    if (!telecaller) {
      return res.status(404).json({ message: 'TeleCaller not found' });
    }

    // Update all students with specified IDs
    const result = await Student.updateMany(
      { _id: { $in: studentIds } },
      { 
        assignedTo: teleCallerId,
        updatedAt: Date.now()
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} students assigned to telecaller`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Assign students to telecallers automatically
// @route   POST /api/admin/assign/automatic
// @access  Private (Admin)
exports.assignStudentsAutomatically = async (req, res) => {
  try {
    // Find all unassigned students
    const unassignedStudents = await Student.find({ assignedTo: null });
    
    if (unassignedStudents.length === 0) {
      return res.status(400).json({ message: 'No unassigned students found' });
    }

    // Get all telecallers
    const telecallers = await User.find({ userType: 'TeleCaller' });
    
    if (telecallers.length === 0) {
      return res.status(400).json({ message: 'No telecallers found' });
    }

    // Separate experienced and fresher telecallers
    const experiencedTelecallers = telecallers.filter(tc => tc.teleCallerType === 'experienced');
    const fresherTelecallers = telecallers.filter(tc => tc.teleCallerType === 'fresher');
    
    // Calculate distribution
    let totalWeight = (experiencedTelecallers.length * 2) + fresherTelecallers.length;
    
    if (totalWeight === 0) {
      return res.status(400).json({ message: 'No valid telecallers to assign' });
    }
    
    // Calculate students per weight unit
    const studentsPerUnit = unassignedStudents.length / totalWeight;
    
    // Create assignment plan
    const assignmentPlan = {};
    
    // For experienced telecallers (2x weight)
    experiencedTelecallers.forEach(tc => {
      assignmentPlan[tc._id] = Math.round(studentsPerUnit * 2);
    });
    
    // For fresher telecallers (1x weight)
    fresherTelecallers.forEach(tc => {
      assignmentPlan[tc._id] = Math.round(studentsPerUnit);
    });
    
    // Track which students are assigned to which telecaller
    let currentStudentIndex = 0;
    const assignments = {};
    
    // Distribute students according to the plan
    for (const [teleCallerId, count] of Object.entries(assignmentPlan)) {
      assignments[teleCallerId] = [];
      
      for (let i = 0; i < count && currentStudentIndex < unassignedStudents.length; i++) {
        assignments[teleCallerId].push(unassignedStudents[currentStudentIndex]._id);
        currentStudentIndex++;
      }
    }
    
    // Assign any remaining students
    while (currentStudentIndex < unassignedStudents.length) {
      // Round-robin through telecallers for any remaining students
      for (const teleCallerId of Object.keys(assignmentPlan)) {
        assignments[teleCallerId].push(unassignedStudents[currentStudentIndex]._id);
        currentStudentIndex++;
        
        if (currentStudentIndex >= unassignedStudents.length) {
          break;
        }
      }
    }
    
    // Update students in database
    const updatePromises = [];
    
    for (const [teleCallerId, studentIds] of Object.entries(assignments)) {
      if (studentIds.length > 0) {
        updatePromises.push(
          Student.updateMany(
            { _id: { $in: studentIds } },
            { 
              assignedTo: teleCallerId,
              updatedAt: Date.now()
            }
          )
        );
      }
    }
    
    // Execute all updates
    await Promise.all(updatePromises);
    
    res.status(200).json({
      success: true,
      message: `${unassignedStudents.length} students assigned automatically`,
      data: assignments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get sample Excel file
// @route   GET /api/admin/sample-excel
// @access  Private (Admin)
exports.getSampleExcel = (req, res) => {
  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // Sample data
    const sampleData = [
      { name: 'John Doe', email: 'john@example.com', phoneNumber: '1234567890', description: 'Interested in MBA', status: 'pending' },
      { name: 'Jane Smith', email: 'jane@example.com', phoneNumber: '0987654321', description: 'Looking for engineering courses', status: 'pending' }
    ];
    
    // Create a worksheet
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    
    // Create a buffer
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    // Set response headers
    res.setHeader('Content-Disposition', 'attachment; filename=student_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Send the file
    res.send(excelBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};