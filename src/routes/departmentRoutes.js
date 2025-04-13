const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Department = require('../models/Department');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { successResponse, errorResponse, notFoundResponse, validationErrorResponse } = require('../utils/apiResponse');
const mongoose = require('mongoose');

// Use JWT auth
router.use(authenticateToken);

// Validation middleware
const departmentValidation = [
    body('name').trim().notEmpty().withMessage('Department name is required'),
    body('description').optional().trim(),
    body('manager').optional().isMongoId().withMessage('Invalid manager ID'),
    body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
];

// Validation result middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return validationErrorResponse(res, 'Validation failed', errors.array());
    }
    next();
};

// Get all departments
router.get('/', async (req, res) => {
    try {
        const departments = await Department.find()
            .populate('manager', 'firstName lastName email');
        return successResponse(res, departments, 'Departments retrieved successfully');
    } catch (error) {
        return errorResponse(res, 'Error fetching departments');
    }
});

// Get department by ID
router.get('/:id', async (req, res) => {
    try {
        const department = await Department.findById(req.params.id)
            .populate('manager', 'firstName lastName email');

        if (!department) {
            return notFoundResponse(res, 'Department not found');
        }

        return successResponse(res, department, 'Department retrieved successfully');
    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid department ID');
        }
        return errorResponse(res, 'Error fetching department');
    }
});

// Create new department
router.post('/', isAdmin, departmentValidation, validate, async (req, res) => {
    try {
        const department = new Department(req.body);
        await department.save();

        const populatedDepartment = await Department.findById(department._id)
            .populate('manager', 'firstName lastName email');

        return successResponse(res, populatedDepartment, 'Department created successfully', 201);
    } catch (error) {
        return errorResponse(res, 'Error creating department', 400);
    }
});

// Update department
router.put('/:id', isAdmin, departmentValidation, validate, async (req, res) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        ).populate('manager', 'firstName lastName email');

        if (!department) {
            return notFoundResponse(res, 'Department not found');
        }

        return successResponse(res, department, 'Department updated successfully');
    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid department ID');
        }
        return errorResponse(res, 'Error updating department', 400);
    }
});

// Delete department
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        const department = await Department.findByIdAndDelete(req.params.id);

        if (!department) {
            return notFoundResponse(res, 'Department not found');
        }

        return successResponse(res, null, 'Department deleted successfully');
    } catch (error) {
        if (error instanceof mongoose.Error.CastError) {
            return notFoundResponse(res, 'Invalid department ID');
        }
        return errorResponse(res, 'Error deleting department');
    }
});

module.exports = router;