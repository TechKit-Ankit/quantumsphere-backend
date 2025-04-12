const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const TimeEntry = require('../models/TimeEntry');
const Employee = require('../models/Employee');
const { authenticateToken } = require('../middleware/auth');

// Authenticate all routes
router.use(authenticateToken);

// Get today's time entry for the current user
router.get('/today', async (req, res) => {
    try {
        // Get the current employee from the user ID
        const employee = await Employee.findOne({ userId: req.user.userId });

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Get start of today and end of today in user's timezone
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find time entry for today
        const timeEntry = await TimeEntry.findOne({
            employee: employee._id,
            date: {
                $gte: today,
                $lt: tomorrow
            }
        });

        if (!timeEntry) {
            return res.json(null); // No entry found for today
        }

        res.json(timeEntry);
    } catch (error) {
        console.error('Error fetching today\'s time entry:', error);
        res.status(500).json({ message: 'Error fetching time entry' });
    }
});

// Clock in
router.post('/clock-in', async (req, res) => {
    try {
        // Get the current employee from the user ID
        const employee = await Employee.findOne({ userId: req.user.userId });

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Get today's date (without time)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if there's already an entry for today
        let timeEntry = await TimeEntry.findOne({
            employee: employee._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (timeEntry) {
            // Already clocked in for today
            if (timeEntry.clockIn.time) {
                return res.status(400).json({ message: 'Already clocked in for today' });
            }

            // Update existing entry with clock in time
            timeEntry.clockIn.time = new Date();
            timeEntry.clockIn.location = req.body.location || 'Office';
        } else {
            // Create new time entry
            timeEntry = new TimeEntry({
                employee: employee._id,
                date: today,
                clockIn: {
                    time: new Date(),
                    location: req.body.location || 'Office'
                }
            });
        }

        await timeEntry.save();

        res.status(201).json(timeEntry);
    } catch (error) {
        console.error('Error clocking in:', error);
        res.status(500).json({ message: 'Error clocking in' });
    }
});

// Clock out
router.post('/clock-out', async (req, res) => {
    try {
        // Get the current employee from the user ID
        const employee = await Employee.findOne({ userId: req.user.userId });

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Get today's date (without time)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find today's time entry
        const timeEntry = await TimeEntry.findOne({
            employee: employee._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (!timeEntry) {
            return res.status(404).json({ message: 'No clock-in record found for today' });
        }

        if (!timeEntry.clockIn.time) {
            return res.status(400).json({ message: 'Must clock in before clocking out' });
        }

        if (timeEntry.clockOut.time) {
            return res.status(400).json({ message: 'Already clocked out for today' });
        }

        // Update with clock out time
        timeEntry.clockOut.time = new Date();
        timeEntry.clockOut.location = req.body.location || 'Office';

        if (req.body.notes) {
            timeEntry.notes = req.body.notes;
        }

        await timeEntry.save();

        res.json(timeEntry);
    } catch (error) {
        console.error('Error clocking out:', error);
        res.status(500).json({ message: 'Error clocking out' });
    }
});

// Get time entries (with filtering)
router.get('/', async (req, res) => {
    try {
        const query = {};

        // Filter by employee ID if provided
        if (req.query.employee) {
            query.employee = req.query.employee;
        } else {
            // If not admin or HR, only show the current user's entries
            if (req.user.role !== 'admin' && req.user.role !== 'hr') {
                const employee = await Employee.findOne({ userId: req.user.userId });

                if (!employee) {
                    return res.status(404).json({ message: 'Employee not found' });
                }

                query.employee = employee._id;
            }
        }

        // Filter by date range if provided
        if (req.query.startDate && req.query.endDate) {
            query.date = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Sort by date (descending)
        const timeEntries = await TimeEntry.find(query)
            .populate('employee', 'firstName lastName')
            .sort({ date: -1 })
            .limit(req.query.limit ? parseInt(req.query.limit) : 100);

        res.json(timeEntries);
    } catch (error) {
        console.error('Error fetching time entries:', error);
        res.status(500).json({ message: 'Error fetching time entries' });
    }
});

// Get team's time entries (for managers)
router.get('/team', async (req, res) => {
    try {
        // Get the current employee
        const manager = await Employee.findOne({ userId: req.user.userId });

        if (!manager) {
            return res.status(404).json({ message: 'Manager not found' });
        }

        // Get employees reporting to this manager
        const reportingEmployees = await Employee.find({ reportingManager: manager._id });

        if (reportingEmployees.length === 0) {
            return res.json([]);
        }

        const employeeIds = reportingEmployees.map(emp => emp._id);

        const query = {
            employee: { $in: employeeIds }
        };

        // Filter by date range if provided
        if (req.query.startDate && req.query.endDate) {
            query.date = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Get time entries for the team
        const timeEntries = await TimeEntry.find(query)
            .populate('employee', 'firstName lastName')
            .sort({ date: -1 });

        res.json(timeEntries);
    } catch (error) {
        console.error('Error fetching team time entries:', error);
        res.status(500).json({ message: 'Error fetching team time entries' });
    }
});

module.exports = router; 