const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

// Verify JWT token and attach user to request
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Verify token and check if session is valid
        const session = await Session.findOne({ token, isValid: true });
        if (!session || session.expiresAt < new Date()) {
            return res.status(401).json({ message: 'Session expired' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-passwordHash');

        if (!user || user.status !== 'active') {
            return res.status(401).json({ message: 'User not found or inactive' });
        }

        req.user = user;
        req.session = session;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Check if user is an admin
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// Check if user is a manager or admin
const requireManager = (req, res, next) => {
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Manager access required' });
    }
    next();
};

// Check if there are any existing admin users
const checkFirstAdmin = async (req, res, next) => {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (adminExists) {
            return res.status(403).json({ message: 'Admin already exists' });
        }
        next();
    } catch (error) {
        console.error('Check first admin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireManager,
    checkFirstAdmin
}; 