const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const app = express();

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://trail_db_user:ZFjmUOMVSdatCOsq@cluster0.h1pqrer.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = process.env.DB_NAME || 'payslip_system';

// ============================================
// DATABASE CONNECTIONS
// ============================================

let db = null;
let collection = null;
let pdfCollection = null;
let employeeData = [];

console.log('🚀 Starting server on Koyeb...');
console.log(`📊 Database: ${DB_NAME}`);

// ============================================
// MULTER CONFIGURATION (PDF Upload)
// ============================================

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 20 * 1024 * 1024, // 20MB per file
        files: 50
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Static files
app.use(express.static('public'));

// ============================================
// MONGODB CONNECTION
// ============================================

async function connectToMongoDB() {
    try {
        console.log('📡 Connecting to MongoDB Atlas...');
        
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        
        await client.connect();
        console.log('✅ MongoDB connected successfully!');
        
        db = client.db(DB_NAME);
        collection = db.collection('payslip_data');
        pdfCollection = db.collection('payslip_pdfs');
        
        // Create indexes for better performance
        try {
            await collection.createIndex({ 'employees.empId': 1 });
            await pdfCollection.createIndex({ _id: 1 });
            console.log('✅ Indexes created');
        } catch (e) {
            console.log('⚠️ Index may already exist:', e.message);
        }
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('⚠️ Running with local storage only');
        return false;
    }
}

// ============================================
// DATA OPERATIONS
// ============================================

async function loadData() {
    try {
        if (!collection) return null;
        const data = await collection.findOne({ _id: 'payslip_data' });
        if (data) {
            delete data._id;
            employeeData = data.employees || [];
            console.log(`✅ Data loaded: ${employeeData.length} employees`);
            return data;
        }
        return null;
    } catch (error) {
        console.error('❌ Load error:', error.message);
        return null;
    }
}

async function saveData(data) {
    try {
        if (!collection) {
            console.log('⚠️ No MongoDB connection, saving to local cache only');
            return false;
        }
        
        const employeeDataToSave = {
            employees: data.employees || [],
            settings: data.settings || { testMode: false },
            lastUpdated: new Date().toISOString()
        };
        
        await collection.updateOne(
            { _id: 'payslip_data' },
            { $set: employeeDataToSave },
            { upsert: true }
        );
        
        employeeData = data.employees || [];
        console.log(`✅ Data saved: ${employeeData.length} employees`);
        return true;
    } catch (error) {
        console.error('❌ Save error:', error.message);
        return false;
    }
}

// ============================================
// PDF STORAGE
// ============================================

app.post('/api/upload-pdf', upload.single('pdfs'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const filename = req.file.originalname;
        const sizeMB = (req.file.size / 1024 / 1024).toFixed(2);
        console.log(`📄 Uploading: ${filename} (${sizeMB} MB)`);
        
        // Convert to base64 for MongoDB storage
        const base64 = req.file.buffer.toString('base64');
        
        await pdfCollection.updateOne(
            { _id: filename },
            { 
                $set: { 
                    bytes: base64, 
                    size: req.file.size, 
                    lastUpdated: new Date().toISOString() 
                } 
            },
            { upsert: true }
        );
        
        console.log(`✅ PDF saved: ${filename}`);
        res.json({ 
            success: true, 
            message: 'PDF uploaded successfully', 
            filename: filename,
            size: req.file.size
        });
    } catch (error) {
        console.error('❌ Upload error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADMIN AUTHENTICATION
// ============================================

app.post('/api/admin/login', (req, res) => {
    const password = req.body?.password || '';
    if (password === ADMIN_PASSWORD) {
        const token = Buffer.from(`${Date.now()}:${password}`).toString('base64');
        res.json({ success: true, token: token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

app.post('/api/admin/verify', (req, res) => {
    const token = req.body?.token || '';
    try {
        const decoded = Buffer.from(token, 'base64').toString();
        const [, password] = decoded.split(':');
        if (password === ADMIN_PASSWORD) {
            return res.json({ success: true });
        }
    } catch (e) {
        // Invalid token format
    }
    res.json({ success: false });
});

// ============================================
// MAIN API ROUTES
// ============================================

// Get all data
app.get('/api/data', async (req, res) => {
    try {
        const data = await loadData();
        const pdfs = await pdfCollection.find({}).toArray();
        
        const pdfMap = {};
        pdfs.forEach(p => { 
            pdfMap[p._id] = { 
                bytes: p.bytes, 
                pages: 0,
                size: p.size
            }; 
        });
        
        if (data) {
            data.pdfs = pdfMap;
            res.json(data);
        } else {
            res.json({ 
                employees: [], 
                pdfs: pdfMap, 
                settings: { testMode: false } 
            });
        }
    } catch (error) {
        console.error('❌ API data error:', error.message);
        res.json({ employees: [], pdfs: {}, settings: { testMode: false } });
    }
});

// Save employee data
app.post('/api/data', async (req, res) => {
    try {
        const data = req.body;
        if (!data.employees) data.employees = [];
        if (!data.settings) data.settings = { testMode: false };
        
        const saved = await saveData(data);
        if (saved) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to save data' });
        }
    } catch (error) {
        console.error('❌ API save error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Track download
app.post('/api/track-download', async (req, res) => {
    try {
        const { empId } = req.body;
        if (!empId) {
            return res.status(400).json({ error: 'Employee ID required' });
        }
        
        const data = await loadData();
        if (!data || !data.employees) {
            return res.status(404).json({ error: 'No data found' });
        }
        
        const employee = data.employees.find(e => 
            e.empId === empId || 
            e.empId.replace(/^[A-Z]+/, '') === empId.replace(/^[A-Z]+/, '')
        );
        
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        employee.downloadCount = (employee.downloadCount || 0) + 1;
        employee.lastDownload = new Date().toISOString();
        
        await saveData(data);
        
        res.json({ 
            success: true, 
            downloadCount: employee.downloadCount,
            lastDownload: employee.lastDownload
        });
    } catch (error) {
        console.error('❌ Track error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Missing payslips log
app.get('/api/missing-payslips', async (req, res) => {
    try {
        const data = await loadData();
        const pdfs = await pdfCollection.find({}).toArray();
        const pdfFiles = pdfs.map(p => p._id);
        
        const employees = data?.employees || [];
        const totalWithPayslip = employees.filter(e => 
            e.pageNumber && e.pdfFile && pdfFiles.includes(e.pdfFile)
        ).length;
        
        const missing = employees.filter(e => 
            !e.pageNumber || !e.pdfFile || !pdfFiles.includes(e.pdfFile)
        );
        
        const pdfStats = pdfFiles.map(name => ({
            pdfName: name,
            found: employees.filter(e => e.pdfFile === name && e.pageNumber).length,
            missing: employees.length - employees.filter(e => e.pdfFile === name && e.pageNumber).length
        }));
        
        res.json({
            totalEmployees: employees.length,
            totalWithPayslip: totalWithPayslip,
            pdfStats: pdfStats,
            missingEmployees: missing.map(e => ({
                empId: e.empId,
                name: e.name,
                pageNumber: e.pageNumber || 'Not found',
                pdfFile: e.pdfFile || 'Not assigned'
            }))
        });
    } catch (error) {
        console.error('❌ Missing log error:', error.message);
        res.json({ 
            totalEmployees: 0, 
            totalWithPayslip: 0, 
            pdfStats: [], 
            missingEmployees: [] 
        });
    }
});

// Health check (for Koyeb)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        platform: 'Koyeb',
        employees: employeeData.length,
        mongodb: !!collection
    });
});

// ============================================
// FRONTEND ROUTES
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', async () => {
    console.log('🔄 Received SIGTERM, saving data...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔄 Received SIGINT, saving data...');
    process.exit(0);
});

// ============================================
// START SERVER
// ============================================

async function start() {
    // Connect to MongoDB
    const connected = await connectToMongoDB();
    
    // Load existing data
    await loadData();
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`📊 Employees loaded: ${employeeData.length}`);
        console.log(`💾 MongoDB: ${connected ? 'Connected ✅' : 'Disconnected ⚠️'}`);
        console.log(`🌐 Koyeb URL: https://your-app.koyeb.app`);
        console.log(`🔐 Admin password: ${ADMIN_PASSWORD}`);
    });
}

// Start the application
start();

module.exports = app;
