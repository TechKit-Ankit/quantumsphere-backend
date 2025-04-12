const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// Get all employees
exports.getAllEmployees = async (req, res) => {
    try {
        // If not admin, only return employees from same company
        const user = await User.findById(req.user.userId);

        if (!user || !user.company) {
            return res.status(400).json({ message: 'User company not found' });
        }

        const query = { company: user.company };

        if (req.query.status) {
            query.status = req.query.status;
        }

        const employees = await Employee.find(query)
            .populate('department')
            .populate('reportingManager', 'firstName lastName');

        res.json(employees);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get employee by ID
exports.getEmployeeById = async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .populate('department')
            .populate('reportingManager', 'firstName lastName');

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get current employee
exports.getCurrentEmployee = async (req, res) => {
    try {
        const employee = await Employee.findOne({ userId: req.user.userId })
            .populate('department')
            .populate('reportingManager', 'firstName lastName');

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create new employee
exports.createEmployee = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const employee = new Employee({
            ...req.body,
            userId: req.auth.userId
        });
        const newEmployee = await employee.save();
        res.status(201).json(newEmployee);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Update employee
exports.updateEmployee = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const employee = await Employee.findById(req.params.id);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        Object.assign(employee, req.body);
        const updatedEmployee = await employee.save();
        res.json(updatedEmployee);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        await employee.deleteOne();
        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}; 