const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            console.log('No token provided in request');
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Store the full decoded object in req.user
            req.user = decoded;
            console.log('Token verified for user:', decoded.userId);
            next();
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError.message);
            return res.status(401).json({ message: 'Token is invalid or expired' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
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

module.exports = { authenticateToken, requireAdmin };