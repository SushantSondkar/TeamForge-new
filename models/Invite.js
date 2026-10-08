const mongoose = require("mongoose");

// Simple Invite Schema
const inviteSchema = new mongoose.Schema({
  // The user sending the team invitation (e.g. Lead Coordinator)
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // The candidate receiving the team invitation
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // The team requirement project the invitation is for
  teamRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequirement",
    required: true
  },
  // Role offered to the candidate
  role: {
    type: String,
    default: ""
  },
  // Invite status: PENDING -> ACCEPTED or DECLINED
  status: {
    type: String,
    enum: ["PENDING", "ACCEPTED", "DECLINED"],
    default: "PENDING"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Invite", inviteSchema);
