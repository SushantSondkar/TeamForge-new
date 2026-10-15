const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    enum: ["info", "success", "warning", "danger", "invite"],
    default: "info"
  },
  actionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequestAction"
  },
  link: {
    type: String,
    default: ""
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Notification", notificationSchema);
