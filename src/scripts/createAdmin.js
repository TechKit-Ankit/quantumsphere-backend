const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Company = require('../models/Company');
require('dotenv').config();

async function createAdminWithCompany() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Step 1: Get company details from user input or use defaults
        const companyData = {
            name: process.env.COMPANY_NAME || 'Default Company',
            emailDomain: process.env.COMPANY_DOMAIN || 'company.com',
            status: 'active'
        };

        console.log('\nStep 1: Creating company...');
        console.log('Company details:', companyData);

        // Clean up existing company if it exists
        await Company.deleteOne({ name: companyData.name });

        // Create new company
        const company = new Company(companyData);
        await company.save();
        console.log('Company created successfully!');

        // Step 2: Create admin user
        console.log('\nStep 2: Creating admin user...');

        // Generate admin email using the new format
        const adminEmail = `admin@admin.${companyData.emailDomain}`;
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

        // Clean up existing admin if exists
        await User.deleteOne({ email: adminEmail });
        await Employee.deleteOne({ email: adminEmail });

        // Create admin user
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const user = new User({
            email: adminEmail,
            password: hashedPassword,
            role: 'admin'
        });
        await user.save();

        // Create admin employee record
        const employee = new Employee({
            userId: user._id,
            firstName: 'Admin',
            lastName: 'User',
            email: adminEmail,
            position: 'System Administrator',
            role: 'admin',
            company: company._id,
            status: 'active'
        });
        await employee.save();

        console.log('\nAdmin setup completed successfully!');
        console.log('Login credentials:');
        console.log('Email:', adminEmail);
        console.log('Password:', adminPassword);
        console.log('\nCompany details:');
        console.log('Name:', companyData.name);
        console.log('Email Domain:', companyData.emailDomain);
        console.log('Admin Email Format: firstname.lastname@admin.' + companyData.emailDomain);
        console.log('HR Email Format: firstname.lastname@hr.' + companyData.emailDomain);
        console.log('Employee Email Format: firstname.lastname@' + companyData.emailDomain);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

createAdminWithCompany(); 