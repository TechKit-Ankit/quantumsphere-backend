const Leave = require('../models/Leave');
const { validationResult } = require('express-validator');

// Get all leaves
exports.getAllLeaves = async (req, res) => {
    try {
        const { status, employee } = req.query;
        let query = {};

        // Apply filters
        if (status) {
            query.status = status;
        }
        if (employee) {
            query.employee = employee;
        }

        // If not admin or HR, only show their own leaves
        if (req.auth.role !== 'admin' && req.auth.role !== 'hr') {
            query.employee = req.auth.userId;
        }

        const leaves = await Leave.find(query)
            .populate('employee', 'firstName lastName')
            .populate('approvedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.json(leaves);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get single leave
exports.getLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id)
            .populate('employee', 'firstName lastName')
            .populate('approvedBy', 'firstName lastName');

        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        // Check if user has permission to view this leave
        if (req.auth.role !== 'admin' && req.auth.role !== 'hr' &&
            leave.employee.toString() !== req.auth.userId) {
            return res.status(403).json({ message: 'Not authorized to view this leave request' });
        }

        res.json(leave);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create leave request
exports.createLeave = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const leave = new Leave({
            ...req.body,
            employee: req.auth.userId
        });

        const newLeave = await leave.save();
        res.status(201).json(newLeave);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update leave status (approve/reject)
exports.updateLeaveStatus = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only admin and HR can approve/reject leaves
        if (req.auth.role !== 'admin' && req.auth.role !== 'hr') {
            return res.status(403).json({ message: 'Not authorized to approve/reject leaves' });
        }

        const leave = await Leave.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        if (leave.status !== 'pending') {
            return res.status(400).json({ message: 'Leave request has already been processed' });
        }

        leave.status = req.body.status;
        leave.approvedBy = req.auth.userId;
        leave.comments = req.body.comments;

        const updatedLeave = await leave.save();
        res.json(updatedLeave);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete leave request
exports.deleteLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        // Only the employee who created the leave or admin can delete it
        if (leave.employee.toString() !== req.auth.userId && req.auth.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this leave request' });
        }

        // Only pending leaves can be deleted
        if (leave.status !== 'pending') {
            return res.status(400).json({ message: 'Only pending leave requests can be deleted' });
        }

        await leave.remove();
        res.json({ message: 'Leave request deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}; 