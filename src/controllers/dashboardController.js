const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { errorResponse } = require('../utils/apiResponse');

// Helper to get company ID from user ID
async function getCompanyIdFromUser(userId) {
    const user = await User.findById(userId).select('company').lean();
    if (user?.company) return user.company;
    // Fallback: Check Employee record if User doesn't have company directly
    const employee = await Employee.findOne({ userId: userId }).select('company').lean();
    return employee?.company;
}

exports.getDashboardStats = async (req, res) => {
    try {
        const companyId = await getCompanyIdFromUser(req.user.userId);
        if (!companyId) {
            return errorResponse(res, 'Could not determine user\'s company', 400);
        }

        // Use companyId in queries
        const totalEmployees = await Employee.countDocuments({ company: companyId });
        const activeEmployees = await Employee.countDocuments({ company: companyId, status: 'active' });
        // Note: Assuming Leave model doesn't have a direct company field.
        // We need to get employees of the company first, then filter leaves by those employees.
        const companyEmployeeIds = await Employee.find({ company: companyId }).select('_id').lean();
        const employeeIds = companyEmployeeIds.map(emp => emp._id);

        const pendingLeaves = await Leave.countDocuments({ employee: { $in: employeeIds }, status: 'pending' });

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
        const companyId = await getCompanyIdFromUser(req.user.userId);
        if (!companyId) {
            return errorResponse(res, 'Could not determine user\'s company', 400);
        }

        // Filter leaves by employees belonging to the company
        const companyEmployeeIds = await Employee.find({ company: companyId }).select('_id').lean();
        const employeeIds = companyEmployeeIds.map(emp => emp._id);

        const activities = await Leave.find({ employee: { $in: employeeIds } })
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
        const companyId = await getCompanyIdFromUser(req.user.userId);
        if (!companyId) {
            return errorResponse(res, 'Could not determine user\'s company', 400);
        }

        // Filter leaves by employees belonging to the company
        const companyEmployeeIds = await Employee.find({ company: companyId }).select('_id').lean();
        const employeeIds = companyEmployeeIds.map(emp => emp._id);

        const leaves = await Leave.find({ employee: { $in: employeeIds } })
            .sort({ startDate: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName');

        res.json(leaves);
    } catch (error) {
        console.error('Error getting recent leaves:', error);
        res.status(500).json({ message: 'Error fetching recent leaves' });
    }
};