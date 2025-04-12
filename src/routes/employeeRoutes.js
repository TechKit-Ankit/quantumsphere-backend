const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const employeeController = require('../controllers/employeeController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const Employee = require('../models/Employee');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Validation middleware
const employeeValidation = [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('role').isIn(['employee', 'hr', 'admin']).withMessage('Invalid role'),
    body('position').notEmpty().withMessage('Position is required'),
    body('phoneNumber').optional().isMobilePhone().withMessage('Please enter a valid phone number')
];

// Routes
router.get('/', authenticateToken, employeeController.getAllEmployees);
router.get('/me', authenticateToken, employeeController.getCurrentEmployee);

// Add a new endpoint to get all employees reporting to the current user
router.get('/reporting-to-me', authenticateToken, async (req, res) => {
    try {
        // If user is admin, they can see all employees so we'll return an empty array
        // since they don't need a special "reporting to me" view
        if (req.user.role === 'admin' || req.user.role === 'hr') {
            return res.json([]);
        }

        // Find the current employee
        const manager = await Employee.findOne({ userId: req.user.userId });

        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        // Find all employees reporting to this manager
        const employees = await Employee.find({ reportingManager: manager._id })
            .populate('department', 'name')
            .exec();

        res.json(employees);
    } catch (error) {
        console.error('Error fetching reporting employees:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:id', authenticateToken, employeeController.getEmployeeById);

// Create employee with user account
router.post('/', authenticateToken, requireAdmin, employeeValidation, async (req, res) => {
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { email, userId } = req.body;

        // Get admin's company from token
        const adminUser = await User.findById(req.user.userId).session(session);
        if (!adminUser?.company) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Admin user company not found' });
        }

        // Check if email already exists
        const existingEmployee = await Employee.findOne({ email }).session(session);
        if (existingEmployee) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Employee with this email already exists' });
        }

        // Create employee record with company ID from admin
        const employee = new Employee({
            ...req.body,
            userId: userId, // Use the userId from the already created user
            enrollmentStatus: 'completed',
            enrolledAt: new Date(),
            company: adminUser.company
        });

        // Set reportingManager to null for admin role
        if (employee.role === 'admin') {
            employee.reportingManager = null;
        } else if (!employee.reportingManager) {
            // For non-admin roles, ensure they have a reporting manager
            return res.status(400).json({ message: 'Reporting manager is required for non-admin employees' });
        }

        // Save employee
        await employee.save({ session });

        // Update user with employeeId
        await User.findByIdAndUpdate(
            userId,
            { employeeId: employee._id },
            { session }
        );

        // Commit the transaction
        await session.commitTransaction();

        console.log('Employee created successfully:', employee);

        res.status(201).json({
            message: 'Employee enrolled successfully',
            employee: employee.toObject()
        });
    } catch (error) {
        // If anything fails, abort the transaction
        await session.abortTransaction();
        console.error('Error creating employee:', error);
        res.status(500).json({ message: error.message });
    } finally {
        // End the session
        session.endSession();
    }
});

router.put('/:id', authenticateToken, requireAdmin, employeeValidation, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // If updating role to admin, remove reporting manager
        if (updateData.role === 'admin') {
            updateData.reportingManager = null;
        }

        // For non-admin roles, ensure they have a reporting manager if one is provided
        if (updateData.role !== 'admin' && updateData.reportingManager) {
            // Validate that the reporting manager exists
            const manager = await Employee.findById(updateData.reportingManager);
            if (!manager) {
                return res.status(400).json({ message: 'Reporting manager not found' });
            }
        }

        const employee = await Employee.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('department')
            .populate('reportingManager', 'firstName lastName');

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        res.json(employee);
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ message: error.message });
    }
});

router.delete('/:id', authenticateToken, requireAdmin, employeeController.deleteEmployee);

// Change password (for employees)
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;