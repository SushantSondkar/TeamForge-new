const mongoose = require("mongoose");

const teamRequestActionSchema = new mongoose.Schema({
  // The initiator of the action:
  // - For INVITE: Creator/lead inviting candidate
  // - For APPLY: Candidate applying to team
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // The recipient of the action:
  // - For INVITE: Candidate being invited
  // - For APPLY: Creator/lead receiving application
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  teamRequirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TeamRequirement",
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event"
  },
  role: {
    type: String,
    required: true,
    trim: true
  },
  // Direction flag: INVITE | APPLY
  direction: {
    type: String,
    enum: ["INVITE", "APPLY"],
    required: true
  },
  // Unified status flow:
  // PENDING -> ACCEPTED -> CONFIRMED -> LOCKED (also DECLINED, EXPIRED, ROLE_FILLED)
  status: {
    type: String,
    enum: [
      "PENDING",
      "ACCEPTED",
      "CONFIRMED",
      "LOCKED",
      "DECLINED",
      "EXPIRED",
      "ROLE_FILLED"
    ],
    default: "PENDING"
  },
  // Requester confirmation flag (accepting never locks; the requester confirms)
  confirmedByRequester: {
    type: Boolean,
    default: false
  },
  // Contact sharing step (both sides must opt in before contacts show)
  senderContactOptIn: {
    type: Boolean,
    default: false
  },
  receiverContactOptIn: {
    type: Boolean,
    default: false
  },
  // Timeouts & Expirations
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  confirmationExpiresAt: {
    type: Date,
    default: null
  },
  reminderSent24h: {
    type: Boolean,
    default: false
  },
  reminderSentAt: {
    type: Date,
    default: null
  },
  closingSoonWarningSent: {
    type: Boolean,
    default: false
  },
  closingSoonSentAt: {
    type: Date,
    default: null
  },
  expiredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("TeamRequestAction", teamRequestActionSchema);
