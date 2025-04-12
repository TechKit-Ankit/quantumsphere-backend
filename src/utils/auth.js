const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const generateCorporateEmail = async (firstName, lastName, domain) => {
    let baseEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    let email = baseEmail;
    let counter = 1;

    while (await User.findOne({ corporateEmail: email })) {
        email = baseEmail.replace('@', `.${counter}@`);
        counter++;
    }

    return email;
};

const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

const verifyPassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

module.exports = {
    generateCorporateEmail,
    generateToken,
    verifyPassword
};
