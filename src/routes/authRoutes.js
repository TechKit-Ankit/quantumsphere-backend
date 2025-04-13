const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse, unauthorizedResponse } = require('../utils/apiResponse');

// Validation middleware
const authValidation = [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

// Validation result middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return validationErrorResponse(res, 'Validation failed', errors.array());
    }
    next();
};

// Check if email exists route
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return errorResponse(res, 'Email is required', 400);
        }
        const user = await User.findOne({ email });
        return successResponse(res, { exists: !!user }, 'Email check completed');
    } catch (error) {
        return errorResponse(res, 'Error checking email');
    }
});

// Register route
router.post('/register', authValidation, validate, async (req, res) => {
    try {
        const { email, password, company, firstName, lastName, role, status } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return errorResponse(res, 'User already exists', 400);
        }

        user = new User({
            email,
            password,
            company,
            firstName,
            lastName,
            role: role || 'user',
            status: status || 'active'
        });

        await user.save();

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return successResponse(res, {
            token,
            user: {
                _id: user._id,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                company: user.company
            }
        }, 'Registration successful', 201);
    } catch (error) {
        return errorResponse(res, 'Error during registration');
    }
});

// Login route
router.post('/login', authValidation, validate, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return unauthorizedResponse(res, 'Invalid credentials');
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return unauthorizedResponse(res, 'Invalid credentials');
        }

        // Get associated employee record if exists
        const employee = await Employee.findOne({ userId: user._id });

        // Get role from employee record if it exists, otherwise fallback to user role
        const userRole = employee?.role || user.role || 'user';

        // Update last login time
        await user.updateLastLogin();

        const userData = {
            id: user._id,
            email: user.email,
            role: userRole,
            ...(employee && {
                firstName: employee.firstName,
                lastName: employee.lastName,
                position: employee.position,
                enrollmentStatus: employee.enrollmentStatus
            })
        };

        // Generate token with the correct role
        const token = jwt.sign(
            { userId: user._id, role: userRole },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return successResponse(res, { token, user: userData }, 'Login successful');
    } catch (error) {
        return errorResponse(res, 'Error during login');
    }
});

// Get current user route
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('-password')
            .populate('employeeId');

        if (!user) {
            return notFoundResponse(res, 'User not found');
        }

        // Get associated employee record if exists
        const employee = await Employee.findOne({ userId: user._id });

        const userData = {
            ...user.toObject(),
            employeeData: employee
        };

        return successResponse(res, userData, 'User retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error retrieving user');
    }
});

// Change password route
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return validationErrorResponse(res, 'Both current and new passwords are required');
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return notFoundResponse(res, 'User not found');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return errorResponse(res, 'Current password is incorrect', 400);
        }

        user.password = newPassword;
        await user.save();

        return successResponse(res, null, 'Password updated successfully');
    } catch (error) {
        return errorResponse(res, 'Error changing password');
    }
});

module.exports = router;