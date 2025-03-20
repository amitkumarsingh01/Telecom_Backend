// File: controllers/users.js
const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin)
exports.getUsers = async (req, res) => {
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

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Create user
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
    try {
      const { name, email, password, userType, teleCallerType } = req.body;
  
      // Check if user already exists
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: 'User already exists' });
      }
  
      // Validate telecaller type if user is a TeleCaller
      if (userType === 'TeleCaller' && !teleCallerType) {
        return res.status(400).json({ message: 'TeleCaller type is required' });
      }
  
      // Create user
      const user = await User.create({
        name,
        email,
        password,
        userType,
        teleCallerType: userType === 'TeleCaller' ? teleCallerType : undefined
      });
  
      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  
  // @desc    Update user
  // @route   PUT /api/users/:id
  // @access  Private (Admin)
  exports.updateUser = async (req, res) => {
    try {
      const { name, email, password, userType, teleCallerType } = req.body;
  
      // Build user object
      const userFields = {};
      if (name) userFields.name = name;
      if (email) userFields.email = email;
      if (password) userFields.password = password;
      if (userType) userFields.userType = userType;
      
      // Update teleCallerType only if userType is TeleCaller
      if (userType === 'TeleCaller' && teleCallerType) {
        userFields.teleCallerType = teleCallerType;
      } else if (userType && userType !== 'TeleCaller') {
        userFields.teleCallerType = undefined;
      }
  
      let user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // If email is changing, check if it's already taken
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already in use' });
        }
      }
  
      user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: userFields },
        { new: true, runValidators: true }
      );
  
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  
  // @desc    Delete user
  // @route   DELETE /api/users/:id
  // @access  Private (Admin)
  exports.deleteUser = async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Do not allow deleting yourself
      if (user._id.toString() === req.user.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }
  
      // Make sure you unassign all students assigned to this user if they are a telecaller
      if (user.userType === 'TeleCaller') {
        await Student.updateMany(
          { assignedTo: user._id },
          { assignedTo: null }
        );
      }
  
      // For Agent users, reassign or delete their students based on preference
      // Here we're just reassigning to admin
      if (user.userType === 'Agent') {
        // Find admin user
        const admin = await User.findOne({ userType: 'Admin' });
        
        if (admin) {
          await Student.updateMany(
            { createdBy: user._id },
            { createdBy: admin._id }
          );
        }
      }
  
      await user.deleteOne();
  
      res.status(200).json({
        success: true,
        data: {}
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
    }
  };