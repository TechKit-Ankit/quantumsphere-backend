const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors({
    origin: [
        'https://quantum-sphere.netlify.app',
        'https://quantum-sphere.netlify.app/',
        'http://localhost:5173'
    ],
    credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Connect to MongoDB with improved error handling
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
    serverSelectionTimeoutMS: 5000, // 5 second timeout
    heartbeatFrequencyMS: 2000 // Check server every 2 seconds
})
    .then(() => {
        console.log('Connected to MongoDB Atlas successfully');
        console.log('Database:', mongoose.connection.name);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        console.error('Connection string:', process.env.MONGODB_URI.replace(/:([^:@]{8})[^:@]*@/, ':****@'));
        process.exit(1);
    });

// Check JWT secret
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    process.exit(1);
}

// Import routes and middleware
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const companyRoutes = require('./routes/companyRoutes');
const { authenticateToken } = require('./middleware/auth');
const timeEntryRoutes = require('./routes/timeEntryRoutes');

// Public routes
app.use('/api/auth', authRoutes);
app.use('/companies', companyRoutes); // Company registration is public

// Protected routes
app.use('/api/employees', authenticateToken, employeeRoutes);
app.use('/api/companies', authenticateToken, companyRoutes);
app.use('/api/leaves', authenticateToken, leaveRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/time-entries', authenticateToken, timeEntryRoutes);

// 404 middleware
app.use((req, res) => {
    res.status(404).json({
        message: 'Route not found',
        availableRoutes: [
            '/api/health',
            '/api/auth/*',
            '/api/companies/*',
            '/api/employees/*',
            '/api/leaves/*',
            '/api/dashboard/*',
            '/api/departments/*',
            '/api/time-entries/*'
        ]
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            message: 'Please sign in to continue'
        });
    }
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});