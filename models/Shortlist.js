const mongoose = require("mongoose");

const shortlistSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  teamRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequirement"
  },
  actionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequestAction"
  }
}, {
  timestamps: true
});

// Ensure a candidate is counted only once per unique requester (for Term R: H)
shortlistSchema.index({ requesterId: 1, candidateId: 1 }, { unique: true });

module.exports = mongoose.model("Shortlist", shortlistSchema);
