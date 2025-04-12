const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

// Validation middleware
const authValidation = [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

// Check if email exists route
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        const user = await User.findOne({ email });
        return res.json({ exists: !!user });
    } catch (error) {
        console.error('Error checking email:', error);
        return res.status(500).json({ message: 'Server error checking email' });
    }
});

// Auth routes
router.post('/register', authValidation, authController.register);
router.post('/login', authValidation, authController.login);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;