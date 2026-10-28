const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ""
  },
  category: {
    type: String,
    enum: ["general", "team_locked", "bug", "feature_request"],
    default: "general"
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  pageUrl: {
    type: String,
    maxlength: 200,
    default: ""
  },
  status: {
    type: String,
    enum: ["new", "seen", "resolved"],
    default: "new"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Feedback", feedbackSchema);
