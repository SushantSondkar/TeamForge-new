const mongoose = require("mongoose");

const organizerApplicationSchema = new mongoose.Schema(
  {
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organizationName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },
    department: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    applicantRole: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    facultyCoordinatorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    facultyCoordinatorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200
    },
    plannedEventDetails: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    proofLink: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Enforce single pending application per applicant at the database layer
organizerApplicationSchema.index(
  { applicantId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" }
  }
);

module.exports = mongoose.model("OrganizerApplication", organizerApplicationSchema);
