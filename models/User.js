const mongoose = require("mongoose");

// Simple Candidate / User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: ""
  },
  // List of candidate skills with proficiency level (1 to 5)
  skills: [
    {
      name: {
        type: String,
        required: true
      },
      level: {
        type: Number,
        default: 1,
        min: 1,
        max: 5
      }
    }
  ],
  // Evidence / credibility rating (0 to 1):
  // 0.3 = self-reported, 0.7 = GitHub / projects, 1.0 = teammate-confirmed
  credibility: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  // Teammate feedback rating (0 to 1)
  teammateRating: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  // Count of hackathon / competition wins (0, 1, 2+)
  competitionWins: {
    type: Number,
    default: 0
  },
  // Number of peer reviews received
  reviewCount: {
    type: Number,
    default: 0
  },
  // Availability status: 1 = Free, 0.5 = Partly free, 0 = Not available
  availability: {
    type: Number,
    default: 1,
    min: 0,
    max: 1
  },
  // Timestamp when candidate was last active
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Events / projects this candidate is already committed to
  lockedEvents: [
    {
      type: String
    }
  ]
}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);
