const mongoose = require("mongoose");

const teamReviewSchema = new mongoose.Schema({
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  revieweeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },
  teamRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequirement"
  },
  actionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequestAction"
  },
  // 4 review criteria (rated 1 to 5)
  technicalContribution: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  reliability: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  communication: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  teamwork: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  overallScore: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: {
    type: String,
    default: "",
    trim: true
  },
  // Peer skill verification: names of skills ticked by the requester
  observedSkills: [
    {
      type: String
    }
  ],
  // Double-blind flag: true ONLY after both teammates have submitted their reviews
  isRevealed: {
    type: Boolean,
    default: false
  },
  revealedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Calculate overall score automatically before saving
teamReviewSchema.pre("save", function() {
  const avg = (this.technicalContribution + this.reliability + this.communication + this.teamwork) / 4;
  this.overallScore = Math.round(avg * 10) / 10;
});

// A reviewer can submit at most one review per teammate per event
teamReviewSchema.index({ reviewerId: 1, revieweeId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("TeamReview", teamReviewSchema);
