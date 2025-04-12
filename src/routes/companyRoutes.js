const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const Company = require('../models/Company');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const mongoose = require('mongoose');

// Validation middleware
const companyValidation = [
    body('name').notEmpty().withMessage('Company name is required'),
    body('emailDomain')
        .notEmpty().withMessage('Email domain is required')
        .matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/)
        .withMessage('Invalid email domain format'),
    body('emailSubdomain')
        .notEmpty().withMessage('Email subdomain is required')
        .matches(/^[a-z0-9]+$/)
        .withMessage('Subdomain can only contain lowercase letters and numbers')
];

const companyRegistrationValidation = [
    body('companyName').notEmpty().withMessage('Company name is required'),
    body('emailDomain')
        .notEmpty().withMessage('Email domain is required')
        .matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/)
        .withMessage('Invalid email domain format'),
    body('adminFirstName').notEmpty().withMessage('Admin first name is required'),
    body('adminLastName').notEmpty().withMessage('Admin last name is required'),
    body('adminPassword')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
];

// Get all companies
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const companies = await Company.find().sort({ name: 1 });
        res.json(companies);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Register new company with admin
router.post('/register', companyRegistrationValidation, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            companyName,
            emailDomain,
            adminFirstName,
            adminLastName,
            adminPassword,
            adminEmail
        } = req.body;

        // Check if company name exists
        const existingCompany = await Company.findOne({ name: companyName });
        if (existingCompany) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Company name already exists' });
        }

        // Check if email domain exists
        const existingDomain = await Company.findOne({ emailDomain });
        if (existingDomain) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Email domain already exists' });
        }

        // Check if admin email exists
        const existingAdmin = await User.findOne({ email: adminEmail });
        if (existingAdmin) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Admin email already exists' });
        }

        // Create company
        const company = new Company({
            name: companyName,
            emailDomain,
            status: 'active'
        });
        await company.save({ session });

        // Create admin user first
        const user = new User({
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            company: company._id,
            status: 'active'
        });
        await user.save({ session });

        // Create admin employee record
        const employee = new Employee({
            userId: user._id,
            firstName: adminFirstName,
            lastName: adminLastName,
            email: adminEmail,
            phoneNumber: '0000000000',
            position: 'System Administrator',
            role: 'admin',
            company: company._id,
            department: company._id,
            status: 'active',
            enrollmentStatus: 'completed',
            joinDate: new Date(),
            address: {
                street: 'Company Address',
                city: 'Company City',
                state: 'Company State',
                zipCode: '000000'
            },
            salary: {
                amount: 0,
                currency: 'USD',
                lastUpdated: new Date()
            },
            emergencyContact: {
                name: 'Emergency Contact',
                relationship: 'Other',
                phoneNumber: '0000000000'
            },
            leaveBalance: {
                total: 0,
                used: 0,
                remaining: 0
            }
        });
        await employee.save({ session });

        // Update user with employee reference
        user.employeeId = employee._id;
        await user.save({ session });

        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Company registered successfully',
            company: {
                id: company._id,
                name: company.name,
                emailDomain: company.emailDomain
            },
            admin: {
                email: adminEmail,
                role: 'admin'
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Company registration error:', error);
        res.status(500).json({ message: 'Failed to register company' });
    } finally {
        session.endSession();
    }
});

// Create new company (admin only)
router.post('/', authenticateToken, requireAdmin, companyValidation, async (req, res) => {
    try {
        // Check if company name exists
        const existingName = await Company.findOne({ name: req.body.name });
        if (existingName) {
            return res.status(400).json({ message: 'Company name already exists' });
        }

        // Check if email domain combination exists
        const existingDomain = await Company.findOne({
            emailDomain: req.body.emailDomain,
            emailSubdomain: req.body.emailSubdomain
        });
        if (existingDomain) {
            return res.status(400).json({ message: 'Email domain combination already exists' });
        }

        const company = new Company(req.body);
        const newCompany = await company.save();
        res.status(201).json(newCompany);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update company
router.put('/:id', authenticateToken, requireAdmin, companyValidation, async (req, res) => {
    try {
        // Check if company name exists for other companies
        const existingName = await Company.findOne({
            name: req.body.name,
            _id: { $ne: req.params.id }
        });
        if (existingName) {
            return res.status(400).json({ message: 'Company name already exists' });
        }

        // Check if email domain combination exists for other companies
        const existingDomain = await Company.findOne({
            emailDomain: req.body.emailDomain,
            emailSubdomain: req.body.emailSubdomain,
            _id: { $ne: req.params.id }
        });
        if (existingDomain) {
            return res.status(400).json({ message: 'Email domain combination already exists' });
        }

        const company = await Company.findById(req.params.id);
        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        Object.assign(company, req.body);
        const updatedCompany = await company.save();
        res.json(updatedCompany);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Check if company exists
router.get('/check', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, emailDomain } = req.query;
        const exists = await Company.findOne({
            $or: [
                { name },
                { emailDomain }
            ]
        });
        res.json({ exists: !!exists });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 