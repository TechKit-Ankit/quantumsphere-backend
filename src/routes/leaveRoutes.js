const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse, unauthorizedResponse } = require('../utils/apiResponse');

// Validation middleware
const leaveValidation = [
    body('type').isIn(['annual', 'sick', 'personal', 'other']).withMessage('Invalid leave type'),
    body('startDate').isISO8601().withMessage('Invalid start date'),
    body('endDate').isISO8601().withMessage('Invalid end date'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    body('comments').optional().trim()
];

const leaveStatusValidation = [
    body('status').isIn(['approved', 'rejected', 'canceled']).withMessage('Invalid status'),
    body('comments').optional().trim()
];

// Validation result middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return validationErrorResponse(res, 'Validation failed', errors.array());
    }
    next();
};

// Use JWT auth
router.use(authenticateToken);

// Get all leaves (filtered by query params)
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
                return notFoundResponse(res, 'Employee not found');
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
                    return successResponse(res, [], 'No reporting employees found');
                }
            } else if (!query.employee) {
                // If not viewing team leaves and no specific employee filter, show only current user's leaves
                query.employee = employee._id;
            }
        }

        const leaves = await Leave.find(query)
            .populate('employee', 'firstName lastName')
            .populate('managerApproval.approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        return successResponse(res, leaves, 'Leaves retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error fetching leaves');
    }
});

// Get leaves for a specific employee
router.get('/employee/:employeeId', async (req, res) => {
    try {
        const leaves = await Leave.find({ employee: req.params.employeeId })
            .populate('employee', 'firstName lastName')
            .populate('managerApproval.approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        return successResponse(res, leaves, 'Employee leaves retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error fetching employee leaves');
    }
});

// Create a new leave request
router.post('/', leaveValidation, validate, async (req, res) => {
    try {
        // Check if employee is directly specified in the request
        if (req.body.employee) {
            const leave = new Leave({
                employee: req.body.employee,
                startDate: req.body.startDate,
                endDate: req.body.endDate,
                type: req.body.type,
                reason: req.body.reason,
                comments: req.body.comments,
                status: 'pending'
            });

            await leave.save();
            return successResponse(res, leave, 'Leave request created successfully', 201);
        }

        // Otherwise, find the employee based on the logged-in user
        const employee = await Employee.findOne({ userId: req.user.userId });

        if (!employee) {
            return notFoundResponse(res, 'Employee not found');
        }

        const leave = new Leave({
            employee: employee._id,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            type: req.body.type,
            reason: req.body.reason,
            comments: req.body.comments,
            status: 'pending'
        });

        await leave.save();
        return successResponse(res, leave, 'Leave request created successfully', 201);
    } catch (error) {
        return errorResponse(res, 'Error creating leave request');
    }
});

// Update leave status
router.patch('/:id/status', leaveStatusValidation, validate, async (req, res) => {
    try {
        const { status, comments } = req.body;
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }

        // Ensure only admin can use this endpoint
        if (req.user.role !== 'admin') {
            return unauthorizedResponse(res, 'Admin access required to update leave status');
        }

        // Prevent updating already processed leaves if desired (optional check)
        // if (leave.status !== 'pending') {
        //    return errorResponse(res, 'Leave request already processed', 400);
        // }

        const originalStatus = leave.status;

        // Update only the main status and related fields
        leave.status = status;
        // Optionally add a field to track who updated the status if needed
        // leave.statusUpdatedBy = req.user.userId; 
        leave.statusUpdateDate = new Date(); // Consider a dedicated field if needed
        leave.statusComments = comments; // Consider a dedicated field if needed

        // DO NOT MODIFY managerApproval here - this endpoint is for overall status

        await leave.save();

        // Update employee leave balance based on the main status change
        const isNewlyApproved = originalStatus !== 'approved' && status === 'approved';
        const isApprovalRevoked = originalStatus === 'approved' && (status === 'rejected' || status === 'canceled');

        if (isNewlyApproved) {
            await updateEmployeeLeaveBalance(leave);
        } else if (isApprovalRevoked) {
            await restoreLeaveBalance(leave);
        }

        return successResponse(res, leave, 'Leave status updated successfully');
    } catch (error) {
        // Log the detailed error
        console.error(`Error updating leave status for ${req.params.id}:`, error);
        return errorResponse(res, 'Error updating leave status', 500, error.message);
    }
});

// Delete leave request
router.delete('/:id', async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);

        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }

        // Check if the leave was approved - need to restore leave balance
        if (leave.status === 'approved') {
            await restoreLeaveBalance(leave);
        }

        await Leave.deleteOne({ _id: req.params.id });
        return successResponse(res, null, 'Leave request deleted successfully');
    } catch (error) {
        return errorResponse(res, 'Error deleting leave request');
    }
});

// Update leave request
router.put('/:id', leaveValidation, validate, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Find the leave by ID
        const leave = await Leave.findById(id);

        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }

        // Check if we're changing status from pending to approved
        const isNewlyApproved = leave.status !== 'approved' && updateData.status === 'approved';

        // Check if we're changing status from approved to rejected/canceled
        const isApprovalRevoked = leave.status === 'approved' &&
            (updateData.status === 'rejected' || updateData.status === 'canceled');

        // Update the fields
        Object.assign(leave, updateData);

        // Save the updated leave
        await leave.save();

        // If the leave was just approved, update the employee's leave balance
        if (isNewlyApproved) {
            await updateEmployeeLeaveBalance(leave);
        }
        // If approval was revoked, restore the leave balance
        else if (isApprovalRevoked) {
            await restoreLeaveBalance(leave);
        }

        return successResponse(res, leave, 'Leave request updated successfully');
    } catch (error) {
        return errorResponse(res, 'Error updating leave request');
    }
});

// Helper function to update employee leave balance
async function updateEmployeeLeaveBalance(leave) {
    try {
        const employee = await Employee.findById(leave.employee);
        if (!employee || !employee.leaveBalance) return;

        // Calculate number of days
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

        // Update leave balance
        employee.leaveBalance.used += diffDays;
        employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

        await employee.save();
    } catch (error) {
        // Log error but allow process to continue
        console.error(`Error updating leave balance for employee ${leave.employee}: ${error.message}`);
    }
}

// Helper function to restore employee leave balance
async function restoreLeaveBalance(leave) {
    try {
        const employee = await Employee.findById(leave.employee);
        if (!employee || !employee.leaveBalance) return;

        // Calculate number of days
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

        // Restore leave balance
        employee.leaveBalance.used = Math.max(0, employee.leaveBalance.used - diffDays);
        employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;

        await employee.save();
    } catch (error) {
        // Log error but allow process to continue
        console.error(`Error restoring leave balance for employee ${leave.employee}: ${error.message}`);
    }
}

module.exports = router;