const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const { errorResponse, unauthorizedResponse } = require('./utils/apiResponse');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Security headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173']
    }
}));

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [
        'http://localhost:5173',
        'https://quantum-sphere.netlify.app',
        'https://quantumsphere-frontend.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint (no auth required)
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        const memoryUsage = process.memoryUsage();

        res.json({
            status: 'ok',
            database: dbStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB'
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'Service unavailable',
            error: error.message
        });
    }
});

// Connect to MongoDB with improved error handling
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 30000, // 30 seconds
    heartbeatFrequencyMS: 2000,
    maxPoolSize: 10,
    minPoolSize: 5
})
    .then(() => {
        console.log('Connected to MongoDB Atlas successfully');
        console.log('Database:', mongoose.connection.name);
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        console.error('Connection string:', process.env.MONGODB_URI.replace(/:([^:@]{8})[^:@]*@/, ':****@'));
        // Attempt to reconnect
        setTimeout(() => {
            console.log('Attempting to reconnect to MongoDB...');
            process.exit(1);
        }, 5000);
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
app.use('/api/companies', companyRoutes);

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
    console.error('Server Error:', err);

    if (err.name === 'UnauthorizedError') {
        return unauthorizedResponse(res, 'Please sign in to continue');
    }

    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        return errorResponse(res, 'Database service unavailable', 503);
    }

    if (err.name === 'ValidationError') {
        return errorResponse(res, 'Validation error', 400, err.errors);
    }

    return errorResponse(res, 'Internal server error', 500);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});