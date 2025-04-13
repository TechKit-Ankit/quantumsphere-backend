const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const Employee = require('../models/Employee');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse, unauthorizedResponse } = require('../utils/apiResponse');

// Validation middleware
const employeeValidation = [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('role').isIn(['employee', 'hr', 'admin']).withMessage('Invalid role'),
    body('position').notEmpty().withMessage('Position is required'),
    body('phoneNumber').optional().isMobilePhone().withMessage('Please enter a valid phone number')
];

// Validation result middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return validationErrorResponse(res, 'Validation failed', errors.array());
    }
    next();
};

// Get all employees (admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
    try {
        const employees = await Employee.find()
            .select('-password')
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');
        return successResponse(res, employees, 'Employees retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error retrieving employees');
    }
});

// Get current employee profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const employee = await Employee.findOne({ userId: req.user.userId })
            .select('-password')
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');

        if (!employee) {
            return notFoundResponse(res, 'Employee profile not found');
        }
        return successResponse(res, employee, 'Profile retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error retrieving profile');
    }
});

// Get employees reporting to current user
router.get('/reporting-to-me', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            const employees = await Employee.find()
                .select('-password')
                .populate('department', 'name')
                .populate('reportingManager', 'firstName lastName email');
            return successResponse(res, employees, 'All employees retrieved for admin');
        }

        const manager = await Employee.findOne({ userId: req.user.userId });
        if (!manager) {
            return notFoundResponse(res, 'Manager profile not found');
        }

        const employees = await Employee.find({ reportingManager: manager._id })
            .select('-password')
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');

        return successResponse(res, employees, 'Reporting employees retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error retrieving reporting employees');
    }
});

// Get employee by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .select('-password')
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');

        if (!employee) {
            return notFoundResponse(res, 'Employee not found');
        }
        return successResponse(res, employee, 'Employee retrieved successfully');
    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid employee ID');
        }
        return errorResponse(res, 'Error retrieving employee');
    }
});

// Create employee
router.post('/', authenticateToken, isAdmin, employeeValidation, validate, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { email, userId } = req.body;

        const adminUser = await User.findById(req.user.userId).session(session);
        if (!adminUser?.company) {
            await session.abortTransaction();
            return errorResponse(res, 'Admin user company not found', 400);
        }

        const existingEmployee = await Employee.findOne({ email }).session(session);
        if (existingEmployee) {
            await session.abortTransaction();
            return errorResponse(res, 'Employee with this email already exists', 400);
        }

        const employee = new Employee({
            ...req.body,
            userId,
            enrollmentStatus: 'completed',
            enrolledAt: new Date(),
            company: adminUser.company
        });

        if (employee.role === 'admin') {
            employee.reportingManager = null;
        } else if (!employee.reportingManager) {
            await session.abortTransaction();
            return errorResponse(res, 'Reporting manager is required for non-admin employees', 400);
        }

        await employee.save({ session });
        await User.findByIdAndUpdate(userId, { employeeId: employee._id }, { session });
        await session.commitTransaction();

        const populatedEmployee = await Employee.findById(employee._id)
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');

        return successResponse(res, populatedEmployee, 'Employee enrolled successfully', 201);
    } catch (error) {
        await session.abortTransaction();
        return errorResponse(res, 'Error creating employee');
    } finally {
        session.endSession();
    }
});

// Update employee
router.put('/:id', authenticateToken, employeeValidation, validate, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
            return unauthorizedResponse(res, 'Unauthorized to update this profile');
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        )
            .select('-password')
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');

        if (!employee) {
            return notFoundResponse(res, 'Employee not found');
        }

        return successResponse(res, employee, 'Employee updated successfully');
    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid employee ID');
        }
        return errorResponse(res, 'Error updating employee');
    }
});

// Delete employee
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const employee = await Employee.findById(req.params.id).session(session);
        if (!employee) {
            await session.abortTransaction();
            return notFoundResponse(res, 'Employee not found');
        }

        // Update reporting employees to remove this manager
        await Employee.updateMany(
            { reportingManager: employee._id },
            { $set: { reportingManager: null } },
            { session }
        );

        // Delete the employee
        await Employee.findByIdAndDelete(employee._id, { session });

        // Delete associated user if exists
        if (employee.userId) {
            await User.findByIdAndDelete(employee.userId, { session });
        }

        await session.commitTransaction();
        return successResponse(res, null, 'Employee deleted successfully');
    } catch (error) {
        await session.abortTransaction();
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid employee ID');
        }
        return errorResponse(res, 'Error deleting employee');
    } finally {
        session.endSession();
    }
});

// Change password
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