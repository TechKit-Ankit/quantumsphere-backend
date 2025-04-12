const Employee = require('../models/Employee');
const Leave = require('../models/Leave');

exports.getDashboardStats = async (req, res) => {
    try {
        const query = req.user.role === 'admin' ? {} : { userId: req.user.userId };

        const totalEmployees = await Employee.countDocuments();
        const activeEmployees = await Employee.countDocuments({ status: 'active' });
        const pendingLeaves = await Leave.countDocuments({ status: 'pending' });

        res.json({
            totalEmployees,
            activeEmployees,
            pendingLeaves,
        });
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ message: 'Error fetching dashboard statistics' });
    }
};

exports.getRecentActivities = async (req, res) => {
    try {
        const query = req.user.role === 'admin' ? {} : { userId: req.user.userId };

        const activities = await Leave.find(query)
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName');

        res.json(activities);
    } catch (error) {
        console.error('Error getting recent activities:', error);
        res.status(500).json({ message: 'Error fetching recent activities' });
    }
};

exports.getRecentLeaves = async (req, res) => {
    try {
        const query = req.user.role === 'admin' ? {} : { userId: req.user.userId };

        const leaves = await Leave.find(query)
            .sort({ startDate: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName');

        res.json(leaves);
    } catch (error) {
        console.error('Error getting recent leaves:', error);
        res.status(500).json({ message: 'Error fetching recent leaves' });
    }
};