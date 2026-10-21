const mongoose = require("mongoose");

/**
 * Job Schema
 * 
 * Provides atomic, distributed lock management across multiple server instances.
 * Uses a lockedUntil timestamp and findOneAndUpdate for mutual exclusion.
 */
const jobSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  lastRunAt: {
    type: Date,
    default: null
  },
  lastFinishedAt: {
    type: Date,
    default: null
  }
}, {
  collection: "jobs",
  timestamps: true
});

module.exports = mongoose.models.Job || mongoose.model("Job", jobSchema);
