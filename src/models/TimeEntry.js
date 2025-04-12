const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    clockIn: {
        time: {
            type: Date,
            default: null
        },
        location: {
            type: String,
            default: 'Office'
        }
    },
    clockOut: {
        time: {
            type: Date,
            default: null
        },
        location: {
            type: String,
            default: 'Office'
        }
    },
    totalHours: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Calculate total hours when clocking out
timeEntrySchema.pre('save', function (next) {
    if (this.clockIn.time && this.clockOut.time) {
        const clockInTime = new Date(this.clockIn.time);
        const clockOutTime = new Date(this.clockOut.time);
        const diffMs = clockOutTime - clockInTime;
        const diffHrs = diffMs / (1000 * 60 * 60);
        this.totalHours = parseFloat(diffHrs.toFixed(2));
    }
    next();
});

// Create compound index for employee and date to ensure single entry per day
timeEntrySchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TimeEntry', timeEntrySchema); 