require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('./models/Department');
const Employee = require('./models/Employee');
const Leave = require('./models/Leave');

const departments = [
    {
        name: 'Engineering',
        description: 'Software Development and Engineering',
        status: 'active'
    },
    {
        name: 'Human Resources',
        description: 'HR and Employee Management',
        status: 'active'
    },
    {
        name: 'Marketing',
        description: 'Marketing and Communications',
        status: 'active'
    }
];

const employees = [
    {
        clerkId: process.env.ADMIN_CLERK_ID || 'admin_clerk_id', // Use environment variable or default
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 'admin',
        department: null, // Will be updated after departments are created
        position: 'System Administrator',
        phoneNumber: '1234567890',
        address: '123 Admin St',
        hireDate: new Date(),
        status: 'active'
    },
    {
        clerkId: 'emp1_clerk_id',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 'employee',
        department: null, // Will be updated after departments are created
        position: 'Software Engineer',
        phoneNumber: '1234567891',
        address: '456 Employee St',
        hireDate: new Date(),
        status: 'active'
    },
    {
        clerkId: 'emp2_clerk_id',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        role: 'manager',
        department: null, // Will be updated after departments are created
        position: 'Engineering Manager',
        phoneNumber: '1234567892',
        address: '789 Manager St',
        hireDate: new Date(),
        status: 'active'
    }
];

const leaves = [
    {
        employee: null, // Will be updated after employees are created
        type: 'annual',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        status: 'pending',
        reason: 'Family vacation',
        approvedBy: null // Will be updated after employees are created
    },
    {
        employee: null, // Will be updated after employees are created
        type: 'sick',
        startDate: new Date(),
        endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        status: 'approved',
        reason: 'Medical appointment',
        approvedBy: null // Will be updated after employees are created
    }
];

async function seedDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing data
        await Department.deleteMany({});
        await Employee.deleteMany({});
        await Leave.deleteMany({});
        console.log('Cleared existing data');

        // Insert departments
        const createdDepartments = await Department.insertMany(departments);
        console.log('Inserted departments');

        // Update employee department references
        employees[0].department = createdDepartments[0]._id; // Admin in Engineering
        employees[1].department = createdDepartments[0]._id; // John in Engineering
        employees[2].department = createdDepartments[1]._id; // Jane in HR

        // Insert employees
        const createdEmployees = await Employee.insertMany(employees);
        console.log('Inserted employees');

        // Update leave references
        leaves[0].employee = createdEmployees[1]._id; // John's leave
        leaves[0].approvedBy = createdEmployees[2]._id; // Approved by Jane
        leaves[1].employee = createdEmployees[2]._id; // Jane's leave
        leaves[1].approvedBy = createdEmployees[0]._id; // Approved by Admin

        // Insert leaves
        await Leave.insertMany(leaves);
        console.log('Inserted leaves');

        console.log('Database seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase(); 