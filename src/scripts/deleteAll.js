const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Company = require('../models/Company');
const Department = require('../models/Department');
require('dotenv').config();

async function deleteAllRecords() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Delete all records from all collections
        await User.deleteMany({});
        console.log('All users deleted');

        await Employee.deleteMany({});
        console.log('All employees deleted');

        await Company.deleteMany({});
        console.log('All companies deleted');

        await Department.deleteMany({});
        console.log('All departments deleted');

        console.log('All records deleted successfully');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

deleteAllRecords(); 