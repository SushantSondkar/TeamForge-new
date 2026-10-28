const mongoose = require("mongoose");

const eventPosterSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
      index: true
    },
    data: {
      type: Buffer,
      required: true
    },
    contentType: {
      type: String,
      required: true,
      trim: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("EventPoster", eventPosterSchema);

