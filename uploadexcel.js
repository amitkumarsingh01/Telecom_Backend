const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Grid = require('gridfs-stream');
const { GridFSBucket } = require('mongodb');
const app = express();
const PORT = 5000;

// MongoDB Connection
const mongoURI = 'mongodb+srv://aksmlibts:amit@cluster0.e3u0d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoURI);
const conn = mongoose.connection;

// Initialize GridFS Stream
let gfs, bucket;
conn.once('open', () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');  // File collection name

    // GridFSBucket for downloading files
    bucket = new GridFSBucket(conn.db, { bucketName: 'uploads' });
});

// Multer Storage Setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Upload Route
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const writeStream = bucket.openUploadStream(req.file.originalname);
    writeStream.end(req.file.buffer);

    writeStream.on('finish', () => {
        const downloadLink = `http://localhost:5000/download/${writeStream.id}`;
        res.json({ download_link: downloadLink });
    });
});


// Download Route
app.get('/download/:id', async (req, res) => {
    const fileId = req.params.id;
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));

    res.set('Content-Type', 'application/vnd.ms-excel');
    res.set('Content-Disposition', `attachment; filename="downloaded_file.xlsx"`);

    downloadStream.pipe(res).on('error', () => {
        res.status(404).json({ error: 'File not found' });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
