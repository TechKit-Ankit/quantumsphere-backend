const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        enum: ['annual', 'sick', 'personal', 'other'],
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    managerApproval: {
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee',
            default: null
        },
        approvedAt: {
            type: Date,
            default: null
        },
        comments: {
            type: String,
            default: ''
        }
    },
    comments: {
        type: String
    }
}, {
    timestamps: true
});

// Update the updatedAt timestamp before saving
leaveSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Index for querying leaves by employee and status
leaveSchema.index({ employee: 1, status: 1 });

module.exports = mongoose.model('Leave', leaveSchema); 