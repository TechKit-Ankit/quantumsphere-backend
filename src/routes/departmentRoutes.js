const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const departmentController = require('../controllers/departmentController');
const Department = require('../models/Department');
const { authenticateToken } = require('../middleware/auth');

// Use JWT auth instead of Clerk
router.use(authenticateToken);

// Validation middleware
const departmentValidation = [
    body('name').trim().notEmpty().withMessage('Department name is required'),
    body('description').optional().trim(),
    body('manager').optional().isMongoId().withMessage('Invalid manager ID'),
    body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
];

// Routes
router.get('/', async (req, res) => {
    try {
        const departments = await Department.find();
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ message: 'Error fetching departments' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.json(department);
    } catch (error) {
        console.error('Error fetching department:', error);
        res.status(500).json({ message: 'Error fetching department' });
    }
});

router.post('/', async (req, res) => {
    try {
        const department = new Department(req.body);
        await department.save();
        res.status(201).json(department);
    } catch (error) {
        console.error('Error creating department:', error);
        res.status(400).json({ message: 'Error creating department' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.json(department);
    } catch (error) {
        console.error('Error updating department:', error);
        res.status(400).json({ message: 'Error updating department' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const department = await Department.findByIdAndDelete(req.params.id);
        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }
        res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ message: 'Error deleting department' });
    }
});

module.exports = router;