const jwt = require('jsonwebtoken');
const { unauthorizedResponse } = require('../utils/apiResponse');
const Employee = require('../models/Employee');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return unauthorizedResponse(res, 'Access token is required');
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return unauthorizedResponse(res, 'Invalid or expired token');
        }
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return unauthorizedResponse(res, 'Admin access required');
    }
    next();
};

const isManager = (req, res, next) => {
    if (!req.user || req.user.role !== 'manager') {
        return unauthorizedResponse(res, 'Manager access required');
    }
    next();
};

const requireAdmin = async (req, res, next) => {
    try {
        // Check user role first
        if (req.user.role === 'admin') {
            return next();
        }

        // If user role is not admin, check employee role
        const employee = await Employee.findOne({ userId: req.user.userId });
        if (employee && employee.role === 'admin') {
            return next();
        }

        return res.status(403).json({ message: 'Admin access required' });
    } catch (error) {
        console.error('Admin check error:', error);
        return res.status(500).json({ message: 'Error checking admin access' });
    }
};

module.exports = {
    authenticateToken,
    isAdmin,
    isManager,
    requireAdmin
};