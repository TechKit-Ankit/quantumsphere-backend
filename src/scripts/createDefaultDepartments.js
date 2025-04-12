const mongoose = require('mongoose');
const Department = require('../models/Department');
require('dotenv').config();

const defaultDepartments = [
    {
        name: 'Human Resources',
        description: 'Manages employee relations, recruitment, and HR policies',
        status: 'active'
    },
    {
        name: 'Information Technology',
        description: 'Manages IT infrastructure and technical support',
        status: 'active'
    },
    {
        name: 'Finance',
        description: 'Handles financial planning, accounting, and budgeting',
        status: 'active'
    },
    {
        name: 'Operations',
        description: 'Oversees day-to-day business operations',
        status: 'active'
    },
    {
        name: 'Marketing',
        description: 'Manages brand, marketing strategies, and communications',
        status: 'active'
    }
];

async function createDefaultDepartments() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const dept of defaultDepartments) {
            const existingDept = await Department.findOne({ name: dept.name });
            if (!existingDept) {
                await Department.create(dept);
                console.log(`Created department: ${dept.name}`);
            } else {
                console.log(`Department already exists: ${dept.name}`);
            }
        }

        console.log('Default departments created successfully');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

createDefaultDepartments(); 