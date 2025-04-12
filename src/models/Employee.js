const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    userId: {  // Changed from clerkId
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        street: {
            type: String,
            required: true,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zipCode: {
            type: String,
            required: true,
            trim: true
        }
    },
    emergencyContact: {
        name: {
            type: String,
            required: true,
            trim: true
        },
        relationship: {
            type: String,
            required: true,
            trim: true
        },
        phoneNumber: {
            type: String,
            required: true,
            trim: true
        }
    },
    position: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true
    },
    salary: {
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'USD'
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    leaveBalance: {
        total: {
            type: Number,
            required: true,
            default: 0
        },
        used: {
            type: Number,
            default: 0
        },
        remaining: {
            type: Number,
            default: function () {
                return this.leaveBalance.total - this.leaveBalance.used;
            }
        }
    },
    role: {
        type: String,
        enum: ['admin', 'hr', 'employee'],
        default: 'employee'
    },
    reportingManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    enrollmentStatus: {
        type: String,
        enum: ['pending', 'completed', 'rejected'],
        default: 'pending'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'on_leave'],
        default: 'active'
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    workSchedule: {
        startTime: {
            type: String,
            default: '09:00'  // 24-hour format
        },
        endTime: {
            type: String,
            default: '18:00'  // 24-hour format
        },
        workingDays: {
            type: [String],
            default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    inviteToken: {
        type: String
    },
    inviteTokenExpiry: {
        type: Date
    }
}, {
    timestamps: true
});

// Update timestamps before saving
employeeSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    if (this.leaveBalance) {
        this.leaveBalance.remaining = this.leaveBalance.total - this.leaveBalance.used;
    }
    next();
});

// Index for search functionality
employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;