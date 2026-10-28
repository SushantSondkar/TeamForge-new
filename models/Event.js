const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Event name is required"],
    trim: true
  },
  organizer: {
    type: String,
    required: [true, "Organizer name is required"],
    trim: true
  },
  date: {
    type: Date,
    required: [true, "Event date is required"]
  },
  deadline: {
    type: Date,
    required: [true, "Registration deadline is required"]
  },
  mode: {
    type: String,
    enum: ["Online", "Offline", "Hybrid"],
    default: "Offline"
  },
  type: {
    type: String,
    enum: ["Hackathon", "Competition", "Workshop", "Meetup", "Other"],
    default: "Hackathon",
    trim: true
  },
  hasPoster: {
    type: Boolean,
    default: false
  },
  link: {
    type: String,
    trim: true,
    default: ""
  },
  description: {
    type: String,
    default: ""
  },
  isPromoted: {
    type: Boolean,
    default: false
  },
  promotedTagline: {
    type: String,
    default: ""
  },
  prizePool: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Event", eventSchema);
