const express = require('express');
const router = express.Router();
const { getDashboardStats, getRecentActivities, getRecentLeaves } = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth');

// Apply JWT authentication middleware
router.use(authenticateToken);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get recent activities
router.get('/recent-activities', getRecentActivities);

// Get recent leaves
router.get('/recent-leaves', getRecentLeaves);

module.exports = router;