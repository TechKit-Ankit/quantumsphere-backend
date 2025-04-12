const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');

exports.register = async (req, res) => {
    try {
        console.log('Registration attempt:', req.body.email);
        const { email, password, company, firstName, lastName, role, status } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({
            email,
            password,
            company,
            firstName,
            lastName,
            role: role || 'user',
            status: status || 'active'
        });

        await user.save();

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            token,
            user: {
                _id: user._id,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                company: user.company
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

exports.login = async (req, res) => {
    try {
        console.log('Login attempt with:', req.body);
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email });
        console.log('User found:', user ? 'Yes' : 'No');

        if (!user) {
            console.log('User not found with email:', email);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Compare password
        console.log('Comparing passwords...');
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch ? 'Yes' : 'No');

        if (!isMatch) {
            console.log('Password does not match for user:', email);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Get associated employee record if exists
        const employee = await Employee.findOne({ userId: user._id });
        console.log('Associated employee record:', employee ? 'Found' : 'Not found');

        // Get role from employee record if it exists, otherwise fallback to user role
        const userRole = employee?.role || user.role || 'user';

        // Update last login time
        await user.updateLastLogin();

        const userData = {
            id: user._id,
            email: user.email,
            role: userRole,
            ...(employee && {
                firstName: employee.firstName,
                lastName: employee.lastName,
                position: employee.position,
                enrollmentStatus: employee.enrollmentStatus
            })
        };

        // Generate token with the correct role
        console.log('Generating token for user:', user._id);
        const token = jwt.sign(
            { userId: user._id, role: userRole },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('Sending successful login response with user data:', userData);
        res.json({
            token,
            user: userData
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('-password')
            .populate('employeeId');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get associated employee record if exists
        const employee = await Employee.findOne({ userId: user._id });

        const userData = {
            ...user.toObject(),
            employeeData: employee
        };

        res.json({ user: userData });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
