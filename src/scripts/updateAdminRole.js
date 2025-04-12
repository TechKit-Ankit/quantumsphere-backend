const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateAdminRole() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const adminEmail = 'ankit.tripathy@admin.mastercom.com';

        const user = await User.findOne({ email: adminEmail });
        if (!user) {
            console.log('Admin user not found');
            return;
        }

        user.role = 'admin';
        await user.save();

        console.log('Admin role updated successfully');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

updateAdminRole(); 