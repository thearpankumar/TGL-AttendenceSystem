const Batch = require('../models/Batch');
const Session = require('../models/Session');
const ExcelJS = require('exceljs');
const stream = require('stream');
const logger = require('../utils/logger').child({ module: 'batch' });

const createBatch = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Batch name is required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel or CSV file' });
    }

    const file = req.file;
    const students = [];
    const workbook = new ExcelJS.Workbook();
    let worksheet;

    try {
      if (file.originalname.toLowerCase().endsWith('.csv')) {
        const bufferStream = new stream.PassThrough();
        bufferStream.end(file.buffer);
        worksheet = await workbook.csv.read(bufferStream);
      } else {
        await workbook.xlsx.load(file.buffer);
        worksheet = workbook.worksheets[0];
      }
    } catch (_err) {
      return res.status(400).json({ message: 'Failed to parse file. Ensure it is a valid .xlsx or .csv format.' });
    }

    if (!worksheet) {
      return res.status(400).json({ message: 'The uploaded file appears to be empty.' });
    }

    // Attempt to map headers
    const headerRow = worksheet.getRow(1);
    const headerMap = { name: -1, rollNumber: -1, collegeName: -1, email: -1 };
    
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      // Fuzzy matching for Name (ensure it doesn't match College Name)
      if ((val === 'name' || val.includes('student name')) && !val.includes('college')) {
        headerMap.name = colNumber;
      }
      // Fuzzy matching for Roll Number
      if (val.includes('roll') || val.includes('reg') || val === 'id' || val === 'student id') {
        headerMap.rollNumber = colNumber;
      }
      // Fuzzy matching for College
      if (val.includes('college') || val.includes('university') || val.includes('inst')) {
        headerMap.collegeName = colNumber;
      }
      // Fuzzy matching for Email
      if (val.includes('mail') || val === 'e-mail') {
        headerMap.email = colNumber;
      }
    });

    if (headerMap.name === -1 || headerMap.rollNumber === -1) {
      return res.status(400).json({ 
        message: 'Could not detect required columns. Please ensure your file has headers: "Name" and "Roll Number".' 
      });
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      const nameVal = headerMap.name !== -1 ? row.getCell(headerMap.name).value : null;
      const rollVal = headerMap.rollNumber !== -1 ? row.getCell(headerMap.rollNumber).value : null;
      const collegeVal = headerMap.collegeName !== -1 ? row.getCell(headerMap.collegeName).value : null;
      const emailVal = headerMap.email !== -1 ? row.getCell(headerMap.email).value : null;
      
      const cleanStr = (v) => v ? String(v).trim() : '';
      
      const studentName = cleanStr(nameVal?.text || nameVal || nameVal?.result);
      const studentRoll = cleanStr(rollVal?.text || rollVal || rollVal?.result);
      const college = cleanStr(collegeVal?.text || collegeVal || collegeVal?.result);
      const email = cleanStr(emailVal?.text || emailVal || emailVal?.result);

      if (studentName && studentRoll) {
        const studentObj = {
          name: studentName,
          rollNumber: studentRoll,
        };
        if (college) studentObj.collegeName = college;
        if (email) studentObj.email = email;
        students.push(studentObj);
      }
    });

    if (students.length === 0) {
      return res.status(400).json({ message: 'No valid students found in the file. Ensure rows are not empty.' });
    }

    const batch = new Batch({
      name,
      description,
      students,
      createdBy: req.admin._id
    });

    await batch.save();

    res.status(201).json({
      message: 'Batch created successfully',
      batch: {
        _id: batch._id,
        name: batch.name,
        description: batch.description,
        studentCount: batch.students.length,
        createdAt: batch.createdAt
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating batch');
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getBatches = async (req, res) => {
  try {
    // Fetch student counts efficiently using aggregation
    const batchesWithCounts = await Batch.aggregate([
      { $match: { createdBy: req.admin._id } },
      { $project: {
          name: 1,
          description: 1,
          createdAt: 1,
          studentCount: { $size: "$students" }
      }},
      { $sort: { createdAt: -1 } }
    ]);

    res.json(batchesWithCounts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getBatchById = async (req, res) => {
  try {
    const batch = await Batch.findOne({ 
      _id: req.params.id, 
      createdBy: req.admin._id 
    });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    res.json({
      _id: batch._id,
      name: batch.name,
      description: batch.description,
      students: batch.students,
      studentCount: batch.students.length,
      createdAt: batch.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const batch = await Batch.findOneAndDelete({ 
      _id: req.params.id, 
      createdBy: req.admin._id 
    });

    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    
    // Unlink this batch from any sessions using it
    await Session.updateMany(
      { batchId: batch._id },
      { $set: { batchId: null } }
    );

    res.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createBatch,
  getBatches,
  getBatchById,
  deleteBatch
};
