const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
require('dotenv').config();

async function fixAdminRole() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const adminEmail = 'ankit.tripathy@admin.mastercom.com';

        // Update User record
        const user = await User.findOne({ email: adminEmail });
        if (!user) {
            console.log('Admin user not found');
            return;
        }
        user.role = 'admin';
        await user.save();
        console.log('Admin user role updated');

        // Update Employee record
        const employee = await Employee.findOne({ email: adminEmail });
        if (!employee) {
            console.log('Admin employee record not found');
            return;
        }
        employee.role = 'admin';
        await employee.save();
        console.log('Admin employee role updated');

        console.log('Admin roles updated successfully');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

fixAdminRole(); 