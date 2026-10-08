const mongoose = require("mongoose");

// Application Schema connecting applicants with team opportunities
const applicationSchema = new mongoose.Schema({
  // The candidate applying for the role
  applicantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // The team requirement offering the role
  teamRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequirement",
    required: true
  },
  // Role applied for
  role: {
    type: String,
    default: ""
  },
  // Application progress status
  status: {
    type: String,
    enum: [
      "UNDER_REVIEW",
      "INTERVIEWING",
      "ACCEPTED",
      "REJECTED"
    ],
    default: "UNDER_REVIEW"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Application", applicationSchema);
