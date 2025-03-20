const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://aksmlibts:amit@cluster0.e3u0d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.log('MongoDB Connection Error: ', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userType: { type: String, enum: ['Admin', 'Agent', 'TeleCaller'], required: true },
  teleCaller: {
    category: { type: String, enum: ['experienced', 'fresher'] },
    assignedCount: { type: Number, default: 0 }
  }
});

const User = mongoose.model('User', userSchema);

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, new Date().toISOString().replace(/:/g, '-') + file.originalname);
  }
});

// Remove the disk storage configuration
const upload = multer({
    storage: multer.memoryStorage(), // Use memory storage instead of disk storage
    limits: { fileSize: 1024 * 1024 * 5 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          file.mimetype === 'application/vnd.ms-excel') {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files are allowed'), false);
      }
    }
  });

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate' });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).send({ error: 'Access denied' });
    }
    next();
  };
};

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, userType, teleCaller } = req.body;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = new User({
      username,
      password: hashedPassword,
      userType,
      teleCaller: userType === 'TeleCaller' ? teleCaller : undefined
    });
    
    await user.save();
    res.status(201).send({ message: 'User registered successfully' });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user._id, username: user.username, userType: user.userType },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1d' }
    );
    
    res.send({ token, userType: user.userType });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/students', auth, checkRole(['Admin', 'Agent']), async (req, res) => {
  try {
    const { name, email, phone, description } = req.body;
    
    const student = new Student({
      name,
      email,
      phone,
      description,
      addedBy: req.user.id
    });
    
    await student.save();
    res.status(201).send(student);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/students', auth, async (req, res) => {
  try {
    let students;
    
    if (req.user.userType === 'Admin') {
      students = await Student.find().populate('addedBy assignedTo', 'username userType');
    } else if (req.user.userType === 'Agent') {
      students = await Student.find({ addedBy: req.user.id }).populate('assignedTo', 'username');
    } else if (req.user.userType === 'TeleCaller') {
      students = await Student.find({ assignedTo: req.user.id });
    }
    
    res.send(students);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get('/api/students/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('addedBy assignedTo', 'username userType');
    
    if (!student) {
      return res.status(404).send({ error: 'Student not found' });
    }

    if (req.user.userType !== 'Admin' && 
        req.user.userType === 'Agent' && student.addedBy.toString() !== req.user.id &&
        req.user.userType === 'TeleCaller' && student.assignedTo.toString() !== req.user.id) {
      return res.status(403).send({ error: 'Access denied' });
    }
    
    res.send(student);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.put('/api/students/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).send({ error: 'Student not found' });
    }
    
    if (req.user.userType === 'Admin') {
      Object.keys(req.body).forEach(key => {
        student[key] = req.body[key];
      });
    } else if (req.user.userType === 'Agent' && student.addedBy.toString() === req.user.id) {
      const allowedUpdates = ['name', 'email', 'phone', 'description'];
      Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
          student[key] = req.body[key];
        }
      });
    } else if (req.user.userType === 'TeleCaller' && student.assignedTo && student.assignedTo.toString() === req.user.id) {
      if (req.body.status) {
        student.status = req.body.status;
      }
    } else {
      return res.status(403).send({ error: 'Access denied' });
    }
    
    await student.save();
    res.send(student);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete('/api/students/:id', auth, checkRole(['Admin', 'Agent']), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).send({ error: 'Student not found' });
    }
    
    if (req.user.userType === 'Agent' && student.addedBy.toString() !== req.user.id) {
      return res.status(403).send({ error: 'Access denied' });
    }
    
    await Student.deleteOne({ _id: req.params.id });
    res.send({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/upload-excel', [auth, checkRole(['Admin', 'Agent']), upload.single('file')], async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Please upload an Excel file' });
  
      // Use the buffer directly instead of file path
      const workbook = xlsx.read(file.buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
  
      if (!data.length) return res.status(400).json({ error: 'Excel file is empty' });
  
      // Validate data has required fields
      const requiredFields = ['name', 'email', 'phone'];
      const missingFields = data.some(row => {
        return requiredFields.some(field => !row[field]);
      });
  
      if (missingFields) {
        return res.status(400).json({ error: 'Excel data is missing required fields (name, email, phone)' });
      }
  
      const students = data.map(({ name, email, phone, description = '' }) => ({
        name,
        email,
        phone,
        description,
        addedBy: req.user.id
      }));
  
      await Student.insertMany(students);
      res.status(201).json({ message: `${students.length} students added successfully` });
    } catch (error) {
      console.error('Upload Error:', error);
      res.status(500).json({ error: error.message || 'An internal server error occurred' });
    }
  });
  
  app.get('/api/sample-excel', [auth, checkRole(['Admin', 'Agent'])], (req, res) => {
    const sampleData = [
      { name: 'Sample Student', email: 'sample@example.com', phone: '1234567890', description: 'Sample description' }
    ];
  
    const worksheet = xlsx.utils.json_to_sheet(sampleData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');
  
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
    res.setHeader('Content-Disposition', 'attachment; filename=sample-students.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
  
app.get('/api/users', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.send(users);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/assign-automated', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const unassignedStudents = await Student.find({ assignedTo: null });
    
    if (unassignedStudents.length === 0) {
      return res.send({ message: 'No unassigned students found' });
    }
    
    const telecallers = await User.find({ userType: 'TeleCaller' });
    
    if (telecallers.length === 0) {
      return res.status(400).send({ error: 'No telecallers found' });
    }
    
    const experiencedTelecallers = telecallers.filter(t => t.teleCaller.category === 'experienced');
    const fresherTelecallers = telecallers.filter(t => t.teleCaller.category === 'fresher');
    
    const experiencedWeight = 2;
    const fresherWeight = 1;
    
    const totalWeight = (experiencedTelecallers.length * experiencedWeight) + (fresherTelecallers.length * fresherWeight);
    
    if (totalWeight === 0) {
      return res.status(400).send({ error: 'No valid telecallers found' });
    }
    
    const studentPerWeight = Math.floor(unassignedStudents.length / totalWeight);
    
    let assignedCount = 0;
    let currentStudentIndex = 0;
    
    for (const telecaller of experiencedTelecallers) {
      const studentsToAssign = studentPerWeight * experiencedWeight;
      for (let i = 0; i < studentsToAssign && currentStudentIndex < unassignedStudents.length; i++) {
        const student = unassignedStudents[currentStudentIndex];
        student.assignedTo = telecaller._id;
        await student.save();
        currentStudentIndex++;
        assignedCount++;
      }

      telecaller.teleCaller.assignedCount += studentsToAssign;
      await telecaller.save();
    }

    for (const telecaller of fresherTelecallers) {
      const studentsToAssign = studentPerWeight * fresherWeight;
      for (let i = 0; i < studentsToAssign && currentStudentIndex < unassignedStudents.length; i++) {
        const student = unassignedStudents[currentStudentIndex];
        student.assignedTo = telecaller._id;
        await student.save();
        currentStudentIndex++;
        assignedCount++;
      }

      telecaller.teleCaller.assignedCount += studentsToAssign;
      await telecaller.save();
    }

    while (currentStudentIndex < unassignedStudents.length) {
      for (const telecaller of [...experiencedTelecallers, ...fresherTelecallers]) {
        if (currentStudentIndex >= unassignedStudents.length) break;
        
        const student = unassignedStudents[currentStudentIndex];
        student.assignedTo = telecaller._id;
        await student.save();
        currentStudentIndex++;
        assignedCount++;
        telecaller.teleCaller.assignedCount += 1;
        await telecaller.save();
      }
    }
    
    res.send({ message: `${assignedCount} students assigned successfully` });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/assign-manual', auth, checkRole(['Admin']), async (req, res) => {
  try {
    const { studentId, telecallerId } = req.body;
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).send({ error: 'Student not found' });
    }
    
    const telecaller = await User.findById(telecallerId);
    if (!telecaller || telecaller.userType !== 'TeleCaller') {
      return res.status(404).send({ error: 'Telecaller not found' });
    }
    
    student.assignedTo = telecallerId;
    await student.save();
    telecaller.teleCaller.assignedCount += 1;
    await telecaller.save();
    
    res.send({ message: 'Student assigned successfully' });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});
app.get('/api/assigned-students', auth, checkRole(['TeleCaller']), async (req, res) => {
  try {
    const students = await Student.find({ assignedTo: req.user.id });
    res.send(students);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});