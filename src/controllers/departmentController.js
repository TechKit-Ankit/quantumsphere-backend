const Department = require('../models/Department');
const { validationResult } = require('express-validator');

// Get all departments
exports.getAllDepartments = async (req, res) => {
    try {
        const departments = await Department.find()
            .populate('manager', 'firstName lastName')
            .sort({ name: 1 });
        res.json(departments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get single department
exports.getDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id)
            .populate('manager', 'firstName lastName');

        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }

        res.json(department);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create department
exports.createDepartment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only admin and HR can create departments
        if (req.auth.role !== 'admin' && req.auth.role !== 'hr') {
            return res.status(403).json({ message: 'Not authorized to create departments' });
        }

        const department = new Department(req.body);
        const newDepartment = await department.save();
        res.status(201).json(newDepartment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update department
exports.updateDepartment = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Only admin and HR can update departments
        if (req.auth.role !== 'admin' && req.auth.role !== 'hr') {
            return res.status(403).json({ message: 'Not authorized to update departments' });
        }

        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }

        Object.assign(department, req.body);
        const updatedDepartment = await department.save();
        res.json(updatedDepartment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete department
exports.deleteDepartment = async (req, res) => {
    try {
        // Only admin can delete departments
        if (req.auth.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete departments' });
        }

        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }

        await department.remove();
        res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}; 