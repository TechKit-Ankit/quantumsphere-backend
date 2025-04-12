const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const leaveController = require('../controllers/leaveController');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const { authenticateToken } = require('../middleware/auth');

// Validation middleware
const leaveValidation = [
    body('type').isIn(['annual', 'sick', 'personal', 'other']).withMessage('Invalid leave type'),
    body('startDate').isISO8601().withMessage('Invalid start date'),
    body('endDate').isISO8601().withMessage('Invalid end date'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    body('comments').optional().trim()
];

const leaveStatusValidation = [
    body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
    body('comments').optional().trim()
];

// Use JWT auth instead of Clerk
router.use(authenticateToken);

// Routes
router.get('/', async (req, res) => {
    try {
        const query = {};

        // Filter by multiple employee IDs if provided
        if (req.query.employeeIds) {
            const employeeIds = req.query.employeeIds.split(',');
            query.employee = { $in: employeeIds };
        }
        // Filter by single employee ID if provided
        else if (req.query.employee) {
            query.employee = req.query.employee;
        }

        // Filter by status if provided
        if (req.query.status) {
            query.status = req.query.status;
        }

        // If not admin or HR, limit to the current user's leaves
        if (req.user.role !== 'admin' && req.user.role !== 'hr') {
            // Get the current employee to check if they have reporting employees
            const employee = await Employee.findOne({ userId: req.user.userId });

            if (!employee) {
                return res.status(404).json({ message: 'Employee not found' });
            }

            // If no specific query was provided and the endpoint is for 'team-leaves',
            // fetch leaves for employees reporting to this manager
            if (!req.query.employeeIds && !req.query.employee && req.query.view === 'team-leaves') {
                const reportingEmployees = await Employee.find({ reportingManager: employee._id });
                const reportingEmployeeIds = reportingEmployees.map(emp => emp._id);

                if (reportingEmployeeIds.length > 0) {
                    query.employee = { $in: reportingEmployeeIds };
                } else {
                    // No reporting employees, return empty array
                    return res.json([]);
                }
            } else if (!query.employee) {
                // If not viewing team leaves and no specific employee filter, show only current user's leaves
                query.employee = employee._id;
            }
        }

        console.log('Leaves query:', query);

        const leaves = await Leave.find(query)
            .populate('employee', 'firstName lastName')
            .populate('managerApproval.approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.json(leaves);
    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ message: 'Error fetching leaves' });
    }
});

router.get('/employee/:employeeId', async (req, res) => {
    try {
        const leaves = await Leave.find({ employee: req.params.employeeId })
            .sort({ createdAt: -1 });
        res.json(leaves);
    } catch (error) {
        console.error('Error fetching employee leaves:', error);
        res.status(500).json({ message: 'Error fetching employee leaves' });
    }
});

router.post('/', async (req, res) => {
    try {
        console.log('Creating leave request:', req.body);
        // Check if employee is directly specified in the request
        if (req.body.employee) {
            const leave = new Leave({
                employee: req.body.employee,
                startDate: req.body.startDate,
                endDate: req.body.endDate,
                type: req.body.type,
                reason: req.body.reason,
                status: 'pending'
            });

            await leave.save();
            return res.status(201).json(leave);
        }

        // Otherwise, find the employee based on the logged-in user
        const employee = await Employee.findOne({ userId: req.user.userId });

        if (!employee) {
            console.error('Employee not found for user:', req.user.userId);
            return res.status(404).json({ message: 'Employee not found' });
        }

        const leave = new Leave({
            employee: employee._id,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            type: req.body.type,
            reason: req.body.reason,
            status: 'pending'
        });

        await leave.save();
        res.status(201).json(leave);
    } catch (error) {
        console.error('Error creating leave request:', error);
        res.status(500).json({ message: 'Error creating leave request' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        leave.status = status;
        await leave.save();
        res.json(leave);
    } catch (error) {
        console.error('Error updating leave status:', error);
        res.status(500).json({ message: 'Error updating leave status' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        // Check if the leave was approved - need to restore leave balance
        if (leave.status === 'approved') {
            const employee = await Employee.findById(leave.employee);
            if (employee && employee.leaveBalance) {
                // Calculate number of days
                const startDate = new Date(leave.startDate);
                const endDate = new Date(leave.endDate);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

                // Restore leave balance
                employee.leaveBalance.used = Math.max(0, employee.leaveBalance.used - diffDays);
                employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

                await employee.save();
                console.log(`Restored leave balance for employee ${employee._id}, returned ${diffDays} days due to leave deletion`);
            }
        }

        await Leave.deleteOne({ _id: req.params.id });
        res.json({ message: 'Leave request deleted successfully' });
    } catch (error) {
        console.error('Error deleting leave request:', error);
        res.status(500).json({ message: 'Error deleting leave request' });
    }
});

// Add a PUT route for updating leaves
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Find the leave by ID
        const leave = await Leave.findById(id);

        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        // Check if we're changing status from pending to approved
        const isNewlyApproved = leave.status !== 'approved' && updateData.status === 'approved';

        // Check if we're changing status from approved to rejected/canceled
        const isApprovalRevoked = leave.status === 'approved' &&
            (updateData.status === 'rejected' || updateData.status === 'canceled');

        // Store old status for reference
        const oldStatus = leave.status;

        // Update the fields
        Object.assign(leave, updateData);

        // Save the updated leave
        await leave.save();

        // If the leave was just approved, update the employee's leave balance
        if (isNewlyApproved) {
            const employee = await Employee.findById(leave.employee);
            if (employee && employee.leaveBalance) {
                // Calculate number of days
                const startDate = new Date(leave.startDate);
                const endDate = new Date(leave.endDate);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

                // Update leave balance
                employee.leaveBalance.used += diffDays;
                employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

                await employee.save();
                console.log(`Updated leave balance for employee ${employee._id}, used ${diffDays} days`);
            }
        }
        // If approval was revoked, restore the leave balance
        else if (isApprovalRevoked) {
            const employee = await Employee.findById(leave.employee);
            if (employee && employee.leaveBalance) {
                // Calculate number of days
                const startDate = new Date(leave.startDate);
                const endDate = new Date(leave.endDate);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

                // Restore leave balance
                employee.leaveBalance.used = Math.max(0, employee.leaveBalance.used - diffDays);
                employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

                await employee.save();
                console.log(`Restored leave balance for employee ${employee._id}, returned ${diffDays} days`);
            }
        }

        res.json(leave);
    } catch (error) {
        console.error('Error updating leave:', error);
        res.status(500).json({ message: 'Error updating leave request' });
    }
});

// Add a route for manager approval
router.put('/:id/manager-approval', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, comments } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Find the leave request
        const leave = await Leave.findById(id);
        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        // Find the current employee (manager)
        const manager = await Employee.findOne({ userId: req.user.userId });
        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        // Find the employee who requested the leave
        const employee = await Employee.findById(leave.employee);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Check if the current user is the reporting manager of the employee
        // Admin and HR users can approve any leave
        // If employee doesn't have a reporting manager, admin/HR will handle approvals
        const isManagerOfEmployee = employee.reportingManager &&
            employee.reportingManager.toString() === manager._id.toString();
        const isAdminOrHR = req.user.role === 'admin' || req.user.role === 'hr';

        // If employee has no reporting manager, only admin can approve
        const employeeHasNoManager = !employee.reportingManager;

        if (!isManagerOfEmployee && !isAdminOrHR && !employeeHasNoManager) {
            return res.status(403).json({ message: 'You are not authorized to approve/reject this leave request' });
        }

        // Update the manager approval status
        leave.managerApproval = {
            status,
            approvedBy: manager._id,
            approvedAt: new Date(),
            comments: comments || ''
        };

        // If manager approved, also update the main status (for backwards compatibility)
        if (status === 'approved') {
            leave.status = 'approved';

            // Update leave balance if approved
            if (employee && employee.leaveBalance) {
                // Calculate number of days
                const startDate = new Date(leave.startDate);
                const endDate = new Date(leave.endDate);
                const diffTime = Math.abs(endDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

                // Update leave balance
                employee.leaveBalance.used += diffDays;
                employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

                await employee.save();
                console.log(`Updated leave balance for employee ${employee._id}, used ${diffDays} days`);
            }
        } else if (status === 'rejected') {
            leave.status = 'rejected';
        }

        await leave.save();

        res.json(leave);
    } catch (error) {
        console.error('Error updating manager approval:', error);
        res.status(500).json({ message: 'Error updating manager approval' });
    }
});

module.exports = router;