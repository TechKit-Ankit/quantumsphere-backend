const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse, unauthorizedResponse } = require('../utils/apiResponse');
const mongoose = require('mongoose');

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

// Get all leaves (filtered by query params AND company)
router.get('/', async (req, res) => {
    try {
        // Get user's company ID
        const companyId = await getCompanyIdFromUser(req.user.userId);
        if (!companyId) {
            return errorResponse(res, 'Could not determine user\'s company', 400);
        }

        // Start with base query filtering by company employees
        const companyEmployeeIds = await Employee.find({ company: companyId }).select('_id').lean();
        const employeeIds = companyEmployeeIds.map(emp => emp._id);
        const query = { employee: { $in: employeeIds } };

        // Apply optional filters from query params
        if (req.query.employeeIds) {
            // Ensure requested employeeIds are within the user's company
            const requestedIds = req.query.employeeIds.split(',')
                .filter(id => employeeIds.some(empId => empId.toString() === id));
            query.employee = { $in: requestedIds };
        } else if (req.query.employee) {
            // Ensure requested employee is within the user's company
            if (employeeIds.some(empId => empId.toString() === req.query.employee)) {
                query.employee = req.query.employee;
            } else {
                // Requested employee not in company, return empty
                return successResponse(res, [], 'Employee not found in your company');
            }
        } else if (req.query.view === 'team-leaves' && req.user.role !== 'admin') {
            // For team view (non-admin), find manager's direct reports within the company
            const managerEmployee = await Employee.findOne({ userId: req.user.userId, company: companyId }).select('_id').lean();
            if (managerEmployee) {
                const reportingEmployees = await Employee.find({ reportingManager: managerEmployee._id, company: companyId }).select('_id').lean();
                const reportingIds = reportingEmployees.map(emp => emp._id);
                // Ensure we only query reports, even if they have no leaves
                query.employee = { $in: reportingIds.length > 0 ? reportingIds : [new mongoose.Types.ObjectId()] }; // Query for valid IDs or a dummy ID
            } else {
                // Manager not found in the company?
                return successResponse(res, [], 'Manager profile not found in your company');
            }
        } else if (req.user.role !== 'admin') {
            // Default for non-admin, non-team view: only own leaves
            let selfEmployeeId = null;
            if (req.user.employeeId) {
                selfEmployeeId = employeeIds.find(empId => empId.toString() === req.user.employeeId);
            }
            if (!selfEmployeeId) {
                const selfEmployee = await Employee.findOne({ userId: req.user.userId, company: companyId }).select('_id').lean();
                selfEmployeeId = selfEmployee ? selfEmployee._id : new mongoose.Types.ObjectId();
            }
            query.employee = selfEmployeeId;
        }
        // If admin, the base query { employee: { $in: employeeIds } } already covers all company employees

        // Filter by status if provided
        if (req.query.status) {
            query.status = req.query.status;
        }

        const leaves = await Leave.find(query)
            .populate('employee', 'firstName lastName')
            .populate('managerApproval.approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        return successResponse(res, leaves, 'Leaves retrieved successfully for company');
    } catch (error) {
        console.error("Error fetching leaves for company:", error);
        return errorResponse(res, 'Error fetching leaves');
    }
});

// Get leaves for a specific employee
router.get('/employee/:employeeId', async (req, res) => {
    try {
        const actingUserCompanyId = await getCompanyIdFromUser(req.user.userId);
        if (!actingUserCompanyId) {
            return errorResponse(res, 'Could not determine your company', 400);
        }
        const targetEmployee = await Employee.findById(req.params.employeeId).select('company').lean();
        if (!targetEmployee) {
            return notFoundResponse(res, 'Target employee not found');
        }
        if (targetEmployee.company.toString() !== actingUserCompanyId.toString()) {
            return unauthorizedResponse(res, 'Cannot view leaves for employees outside your company');
        }
        const leaves = await Leave.find({ employee: req.params.employeeId })
            .populate('employee', 'firstName lastName')
            .populate('managerApproval.approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });
        return successResponse(res, leaves, 'Employee leaves retrieved successfully');
    } catch (error) {
        console.error("Error fetching specific employee leaves:", error);
        return errorResponse(res, 'Error fetching employee leaves');
    }
});

// Create a new leave request
router.post('/', leaveValidation, validate, async (req, res) => {
    try {
        const actingUserCompanyId = await getCompanyIdFromUser(req.user.userId);
        if (!actingUserCompanyId) {
            return errorResponse(res, 'Could not determine your company', 400);
        }
        let employeeIdToUse;
        if (req.body.employee) {
            const targetEmployee = await Employee.findById(req.body.employee).select('company').lean();
            if (!targetEmployee) {
                return notFoundResponse(res, 'Specified employee not found');
            }
            if (targetEmployee.company.toString() !== actingUserCompanyId.toString()) {
                return unauthorizedResponse(res, 'Cannot create leave for employees outside your company');
            }
            employeeIdToUse = req.body.employee;
        } else {
            const selfEmployee = await Employee.findOne({ userId: req.user.userId }).select('_id company').lean();
            if (!selfEmployee) {
                return notFoundResponse(res, 'Your employee profile not found');
            }
            if (selfEmployee.company.toString() !== actingUserCompanyId.toString()) {
                return unauthorizedResponse(res, 'Cannot create leave, company mismatch');
            }
            employeeIdToUse = selfEmployee._id;
        }
        const leave = new Leave({
            employee: employeeIdToUse,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            type: req.body.type,
            reason: req.body.reason,
            comments: req.body.comments,
            status: 'pending'
        });
        await leave.save();
        const populatedLeave = await Leave.findById(leave._id).populate('employee', 'firstName lastName');
        return successResponse(res, populatedLeave, 'Leave request created successfully', 201);
    } catch (error) {
        console.error("Error creating leave:", error);
        return errorResponse(res, 'Error creating leave request');
    }
});

// Update leave status
router.patch('/:id/status', leaveStatusValidation, validate, async (req, res) => {
    try {
        const actingUserCompanyId = await getCompanyIdFromUser(req.user.userId);
        if (!actingUserCompanyId) {
            return errorResponse(res, 'Could not determine your company', 400);
        }
        const { status, comments } = req.body;
        const leave = await Leave.findById(req.params.id).populate({
            path: 'employee',
            select: 'company'
        });
        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }
        if (!leave.employee || leave.employee.company.toString() !== actingUserCompanyId.toString()) {
            return unauthorizedResponse(res, 'Cannot modify leaves outside your company');
        }
        if (req.user.role !== 'admin') {
            return unauthorizedResponse(res, 'Admin access required to update leave status');
        }
        const originalStatus = leave.status;
        leave.status = status;
        leave.statusUpdateDate = new Date();
        leave.statusComments = comments;
        await leave.save();
        const isNewlyApproved = originalStatus !== 'approved' && status === 'approved';
        const isApprovalRevoked = originalStatus === 'approved' && (status === 'rejected' || status === 'canceled');
        if (isNewlyApproved) {
            await updateEmployeeLeaveBalance(leave);
        } else if (isApprovalRevoked) {
            await restoreLeaveBalance(leave);
        }
        return successResponse(res, leave, 'Leave status updated successfully');
    } catch (error) {
        console.error(`Error updating leave status for ${req.params.id}:`, error);
        return errorResponse(res, 'Error updating leave status', 500, error.message);
    }
});

// Delete leave request
router.delete('/:id', async (req, res) => {
    try {
        const actingUserCompanyId = await getCompanyIdFromUser(req.user.userId);
        if (!actingUserCompanyId) {
            return errorResponse(res, 'Could not determine your company', 400);
        }
        const leave = await Leave.findById(req.params.id).populate({
            path: 'employee',
            select: 'company userId'
        });
        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }
        if (!leave.employee || leave.employee.company.toString() !== actingUserCompanyId.toString()) {
            return unauthorizedResponse(res, 'Cannot delete leaves outside your company');
        }
        if (leave.status === 'approved') {
            await restoreLeaveBalance(leave);
        }
        await Leave.deleteOne({ _id: req.params.id });
        return successResponse(res, null, 'Leave request deleted successfully');
    } catch (error) {
        console.error(`Error deleting leave ${req.params.id}:`, error);
        return errorResponse(res, 'Error deleting leave request');
    }
});

// Update leave request
router.put('/:id', leaveValidation, validate, async (req, res) => {
    try {
        const actingUserCompanyId = await getCompanyIdFromUser(req.user.userId);
        if (!actingUserCompanyId) {
            return errorResponse(res, 'Could not determine your company', 400);
        }
        const { id } = req.params;
        const updateData = req.body;
        const leave = await Leave.findById(id).populate({
            path: 'employee',
            select: 'company'
        });
        if (!leave) {
            return notFoundResponse(res, 'Leave request not found');
        }
        if (!leave.employee || leave.employee.company.toString() !== actingUserCompanyId.toString()) {
            return unauthorizedResponse(res, 'Cannot modify leaves outside your company');
        }
        const originalStatus = leave.status;
        Object.assign(leave, updateData);
        if (updateData.managerApproval?.status === 'approved') {
            console.log(`Manager approved leave ${id}, setting main status to approved.`);
            leave.status = 'approved';
        }
        await leave.save();
        const isNewlyApproved = originalStatus !== 'approved' && leave.status === 'approved';
        const isApprovalRevoked = originalStatus === 'approved' &&
            (leave.status === 'rejected' || leave.status === 'canceled');
        if (isNewlyApproved) {
            await updateEmployeeLeaveBalance(leave);
        } else if (isApprovalRevoked) {
            await restoreLeaveBalance(leave);
        }
        return successResponse(res, leave, 'Leave request updated successfully');
    } catch (error) {
        console.error(`Error updating leave ${req.params.id}:`, error);
        return errorResponse(res, 'Error updating leave request');
    }
});

// Helper function to update employee leave balance
async function updateEmployeeLeaveBalance(leave) {
    try {
        const employee = await Employee.findById(leave.employee);
        if (!employee || !employee.leaveBalance) return;
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        employee.leaveBalance.used += diffDays;
        employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;
        await employee.save();
    } catch (error) {
        console.error(`Error updating leave balance for employee ${leave.employee}: ${error.message}`);
    }
}

// Helper function to restore employee leave balance
async function restoreLeaveBalance(leave) {
    try {
        const employee = await Employee.findById(leave.employee);
        if (!employee || !employee.leaveBalance) return;
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        employee.leaveBalance.used = Math.max(0, employee.leaveBalance.used - diffDays);
        employee.leaveBalance.remaining = employee.leaveBalance.total - employee.leaveBalance.used;
        await employee.save();
    } catch (error) {
        console.error(`Error restoring leave balance for employee ${leave.employee}: ${error.message}`);
    }
}

// --- Helper to get company ID from user ID (Copied from dashboardController) ---
async function getCompanyIdFromUser(userId) {
    const user = await User.findById(userId).select('company').lean();
    if (user?.company) return user.company;
    const employee = await Employee.findOne({ userId: userId }).select('company').lean();
    return employee?.company;
}
// --- End Helper ---

module.exports = router;