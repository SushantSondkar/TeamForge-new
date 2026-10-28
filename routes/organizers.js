const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/Event");
const Notification = require("../models/Notification");
const SuccessStory = require("../models/SuccessStory");
const OrganizerApplication = require("../models/OrganizerApplication");
const requireLogin = require("../middleware/auth");
const { organizerApplyLimiter } = require("../middleware/rateLimiters");
const { sendMail } = require("../utils/mailer");

/**
 * Middleware ensuring user is an admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).send("Forbidden: Only administrators can access this section.");
  }
  next();
}

/**
 * Helper to escape HTML characters for safe email rendering
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Helper to validate http/https URLs up to 500 characters
 */
function isValidHttpUrl(string) {
  if (!string || typeof string !== "string" || string.trim().length > 500) return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

/**
 * Helper to validate email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string" || email.trim().length > 200) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// -------------------------------------------------------------
// 1. GET /organizer/apply - Apply for Organizer status
// -------------------------------------------------------------
router.get("/organizer/apply", requireLogin, async (req, res) => {
  try {
    // 1. Admins should not see the apply form; show "Admin access"
    if (req.user.isAdmin) {
      return res.render("organizers/apply", {
        currentUser: req.user,
        state: "ADMIN",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: {},
        error: null,
        success: false
      });
    }

    // 2. Approved organizers
    if (req.user.isOrganizer && req.user.organizerStatus === "APPROVED") {
      const approvedApp = await OrganizerApplication.findOne({ applicantId: req.user._id, status: "APPROVED" }).sort({ updatedAt: -1 });
      return res.render("organizers/apply", {
        currentUser: req.user,
        state: "APPROVED",
        latestApp: approvedApp,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: {},
        error: null,
        success: false
      });
    }

    // 3. Check latest application record
    const latestApp = await OrganizerApplication.findOne({ applicantId: req.user._id }).sort({ createdAt: -1 });

    if (latestApp && latestApp.status === "PENDING") {
      return res.render("organizers/apply", {
        currentUser: req.user,
        state: "PENDING",
        latestApp,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: {},
        error: null,
        success: req.query.success === "true"
      });
    }

    // 4. Handle legacy pending users with no application record: ask them to reapply
    if (req.user.organizerStatus === "PENDING" && !latestApp) {
      req.user.organizerStatus = "NONE";
      await req.user.save();
      return res.render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: { organizationName: req.user.organizationName || "", reason: req.user.organizerReason || "" },
        error: "We have upgraded our organizer verification process. Please complete the verified application form below to request organizer status.",
        success: false
      });
    }

    // 5. Check 7-day cooldown on rejected applications
    if (latestApp && latestApp.status === "REJECTED") {
      const reviewedAt = latestApp.reviewedAt || latestApp.updatedAt || latestApp.createdAt;
      const cooldownMs = 7 * 24 * 60 * 60 * 1000;
      const reapplyDate = new Date(reviewedAt.getTime() + cooldownMs);
      const now = new Date();
      const cooldownActive = now < reapplyDate;
      const cooldownRemainingDays = cooldownActive ? Math.ceil((reapplyDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 0;

      return res.render("organizers/apply", {
        currentUser: req.user,
        state: cooldownActive ? "REJECTED_COOLDOWN" : "FORM",
        latestApp,
        reapplyDate,
        cooldownRemainingDays,
        formData: cooldownActive ? {} : {
          organizationName: latestApp.organizationName,
          department: latestApp.department,
          applicantRole: latestApp.applicantRole,
          facultyCoordinatorName: latestApp.facultyCoordinatorName
        },
        error: null,
        success: false
      });
    }

    // 6. Default: regular application form
    res.render("organizers/apply", {
      currentUser: req.user,
      state: "FORM",
      latestApp: null,
      reapplyDate: null,
      cooldownRemainingDays: 0,
      formData: {},
      error: null,
      success: req.query.success === "true"
    });
  } catch (err) {
    console.error("Error loading organizer apply page:", err.message);
    res.status(500).send("Error loading organizer application page.");
  }
});

// -------------------------------------------------------------
// 2. POST /organizer/apply - Submit organizer request
// -------------------------------------------------------------
router.post("/organizer/apply", requireLogin, organizerApplyLimiter, async (req, res) => {
  try {
    // Admins do not need to apply
    if (req.user.isAdmin) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "ADMIN",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: {},
        error: "Administrators already have full organizer privileges without applying.",
        success: false
      });
    }

    // Enforce 1 pending application per applicant (code check before DB partial unique index)
    const existingPending = await OrganizerApplication.findOne({
      applicantId: req.user._id,
      status: "PENDING"
    });
    if (existingPending) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "PENDING",
        latestApp: existingPending,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: {},
        error: "You already have an organizer application pending review. Multiple pending submissions are not permitted.",
        success: false
      });
    }

    // Enforce 7-day reapplication cooldown if previously rejected
    const latestApp = await OrganizerApplication.findOne({ applicantId: req.user._id }).sort({ createdAt: -1 });
    if (latestApp && latestApp.status === "REJECTED") {
      const reviewedAt = latestApp.reviewedAt || latestApp.updatedAt || latestApp.createdAt;
      const cooldownMs = 7 * 24 * 60 * 60 * 1000;
      const reapplyDate = new Date(reviewedAt.getTime() + cooldownMs);
      const now = new Date();
      if (now < reapplyDate) {
        const daysRemaining = Math.ceil((reapplyDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return res.status(400).render("organizers/apply", {
          currentUser: req.user,
          state: "REJECTED_COOLDOWN",
          latestApp,
          reapplyDate,
          cooldownRemainingDays: daysRemaining,
          formData: {},
          error: `A 7-day waiting period is required after rejection before reapplying. You can reapply on ${reapplyDate.toLocaleDateString()}.`,
          success: false
        });
      }
    }

    const {
      organizationName,
      department,
      applicantRole,
      facultyCoordinatorName,
      facultyCoordinatorEmail,
      plannedEventDetails,
      proofLink,
      reason
    } = req.body;

    const trimmedOrg = (organizationName || "").trim();
    const trimmedDept = (department || "").trim();
    const trimmedRole = (applicantRole || "").trim();
    const trimmedFacName = (facultyCoordinatorName || "").trim();
    const trimmedFacEmail = (facultyCoordinatorEmail || "").trim().toLowerCase();
    const trimmedDetails = (plannedEventDetails || "").trim();
    const trimmedProof = (proofLink || "").trim();
    const trimmedReason = (reason || "").trim();

    // Field-by-field length and format validations
    if (!trimmedOrg || trimmedOrg.length < 2 || trimmedOrg.length > 150) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Organization or club name is required (between 2 and 150 characters).",
        success: false
      });
    }

    if (!trimmedDept || trimmedDept.length < 2 || trimmedDept.length > 100) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Department name is required (between 2 and 100 characters).",
        success: false
      });
    }

    if (!trimmedRole || trimmedRole.length < 2 || trimmedRole.length > 100) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Your role in the organization is required (between 2 and 100 characters).",
        success: false
      });
    }

    if (!trimmedFacName || trimmedFacName.length < 2 || trimmedFacName.length > 100) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Faculty coordinator name is required (between 2 and 100 characters).",
        success: false
      });
    }

    if (!trimmedFacEmail || !isValidEmail(trimmedFacEmail)) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "A valid faculty coordinator email address is required.",
        success: false
      });
    }

    // Faculty coordinator email must be different from applicant's own email
    if (trimmedFacEmail === (req.user.email || "").trim().toLowerCase()) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Faculty coordinator email must be different from your own account email.",
        success: false
      });
    }

    if (!trimmedDetails || trimmedDetails.length < 10 || trimmedDetails.length > 2000) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "Planned event details and approximate dates are required (between 10 and 2000 characters).",
        success: false
      });
    }

    if (!trimmedProof || !isValidHttpUrl(trimmedProof)) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "A valid HTTP or HTTPS proof link is required (max 500 characters).",
        success: false
      });
    }

    if (!trimmedReason || trimmedReason.length < 10 || trimmedReason.length > 2000) {
      return res.status(400).render("organizers/apply", {
        currentUser: req.user,
        state: "FORM",
        latestApp: null,
        reapplyDate: null,
        cooldownRemainingDays: 0,
        formData: req.body,
        error: "A short reason for applying is required (between 10 and 2000 characters).",
        success: false
      });
    }

    // Persist application
    const application = new OrganizerApplication({
      applicantId: req.user._id,
      organizationName: trimmedOrg,
      department: trimmedDept,
      applicantRole: trimmedRole,
      facultyCoordinatorName: trimmedFacName,
      facultyCoordinatorEmail: trimmedFacEmail,
      plannedEventDetails: trimmedDetails,
      proofLink: trimmedProof,
      reason: trimmedReason,
      status: "PENDING"
    });

    try {
      await application.save();
    } catch (saveErr) {
      // If MongoDB partial unique index is violated (e.g. concurrent race)
      if (saveErr.code === 11000) {
        return res.status(400).render("organizers/apply", {
          currentUser: req.user,
          state: "PENDING",
          latestApp: await OrganizerApplication.findOne({ applicantId: req.user._id, status: "PENDING" }),
          reapplyDate: null,
          cooldownRemainingDays: 0,
          formData: {},
          error: "You already have a pending organizer application under review.",
          success: false
        });
      }
      throw saveErr;
    }

    // Synchronize User model
    req.user.organizationName = trimmedOrg;
    req.user.organizerReason = trimmedReason;
    req.user.organizerStatus = "PENDING";
    await req.user.save();

    res.redirect("/organizer/apply?success=true");
  } catch (err) {
    console.error("Error submitting organizer application:", err.message);
    res.status(500).render("organizers/apply", {
      currentUser: req.user,
      state: "FORM",
      latestApp: null,
      reapplyDate: null,
      cooldownRemainingDays: 0,
      formData: req.body,
      error: "An unexpected error occurred while submitting your application: " + err.message,
      success: false
    });
  }
});

// -------------------------------------------------------------
// 3. GET /admin/organizers - Admin review panel
// -------------------------------------------------------------
router.get("/admin/organizers", requireLogin, requireAdmin, async (req, res) => {
  try {
    const pendingApplications = await OrganizerApplication.find({ status: "PENDING" })
      .populate("applicantId", "name email department year role profilePic")
      .sort({ createdAt: -1 });

    const approvedApplications = await OrganizerApplication.find({ status: "APPROVED" })
      .populate("applicantId", "name email department year role profilePic")
      .populate("reviewedBy", "name email")
      .sort({ reviewedAt: -1, updatedAt: -1 });

    const rejectedApplications = await OrganizerApplication.find({ status: "REJECTED" })
      .populate("applicantId", "name email department year role profilePic")
      .populate("reviewedBy", "name email")
      .sort({ reviewedAt: -1, updatedAt: -1 });

    // Include existing users approved before the standalone application model
    const approvedApplicantIds = approvedApplications.map(a => a.applicantId?._id).filter(Boolean);
    const legacyApprovedOrganizers = await User.find({
      isOrganizer: true,
      organizerStatus: "APPROVED",
      _id: { $nin: approvedApplicantIds }
    }).select("-profilePic").sort({ updatedAt: -1 });

    res.render("admin/organizers", {
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      legacyApprovedOrganizers,
      // Provide backwards-compatible aliases
      pendingOrganizers: pendingApplications,
      approvedOrganizers: approvedApplications,
      rejectedOrganizers: rejectedApplications,
      currentUser: req.user
    });
  } catch (err) {
    console.error("Error loading admin organizers panel:", err.message);
    res.status(500).send("Error loading admin organizers panel.");
  }
});

// -------------------------------------------------------------
// 4. POST /admin/organizers/:id/approve - Approve organizer
// -------------------------------------------------------------
router.post("/admin/organizers/:id/approve", requireLogin, requireAdmin, async (req, res) => {
  try {
    // 1. Locate application by application ID or applicant ID
    let application = await OrganizerApplication.findById(req.params.id);
    if (!application) {
      application = await OrganizerApplication.findOne({ applicantId: req.params.id, status: "PENDING" });
    }

    if (!application) {
      return res.status(404).send("Application not found.");
    }

    // 2. Block self-approval: admins cannot approve their own application
    if (application.applicantId.toString() === req.user._id.toString()) {
      return res.status(403).send("Forbidden: Administrators cannot approve their own organizer application.");
    }

    // 3. Atomic transition: update only if status is still PENDING
    const updatedApplication = await OrganizerApplication.findOneAndUpdate(
      { _id: application._id, status: "PENDING" },
      {
        status: "APPROVED",
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { returnDocument: "after" }
    );

    if (!updatedApplication) {
      return res.status(409).send("Application has already been reviewed or decided.");
    }

    // 4. Synchronize User record
    const applicant = await User.findById(updatedApplication.applicantId);
    if (applicant) {
      applicant.isOrganizer = true;
      applicant.organizerStatus = "APPROVED";
      applicant.organizationName = updatedApplication.organizationName;
      await applicant.save();

      // 5. Create in-app Notification
      await Notification.create({
        userId: applicant._id,
        title: "Organizer Account Approved! 🎖️",
        subtitle: `Your organizer account for ${updatedApplication.organizationName} has been approved by campus administration. You can now post and manage campus hackathons.`,
        type: "success",
        link: "/events"
      });

      // 6. Send transactional email (wrapped so mail errors never fail the action)
      try {
        await sendMail({
          to: applicant.email,
          subject: "TeamForge: Organizer Account Approved! 🎖️",
          text: `Hello ${applicant.name},\n\nGreat news! Your organizer application for "${updatedApplication.organizationName}" has been approved by campus administration.\n\nYou can now post campus competitions and promote hackathons on TeamForge.\n\nVisit: /events/new\n\n- The TeamForge Team`,
          html: `<p>Hello <strong>${escapeHtml(applicant.name)}</strong>,</p><p>Great news! Your organizer application for <strong>${escapeHtml(updatedApplication.organizationName)}</strong> has been approved by campus administration.</p><p>You can now post campus competitions and promote hackathons on TeamForge.</p><p><a href="/events/new">Post a New Hackathon</a></p>`
        });
      } catch (emailErr) {
        console.error(`[Email] Failed to dispatch organizer approval email to ${applicant.email}:`, emailErr.message);
      }
    }

    res.redirect("/admin/organizers");
  } catch (err) {
    console.error("Error approving organizer:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 5. POST /admin/organizers/:id/reject - Reject organizer
// -------------------------------------------------------------
router.post("/admin/organizers/:id/reject", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).send("Rejection reason is required.");
    }

    const trimmedReason = rejectionReason.trim();
    if (trimmedReason.length > 500) {
      return res.status(400).send("Rejection reason cannot exceed 500 characters.");
    }

    // 1. Locate application by application ID or applicant ID
    let application = await OrganizerApplication.findById(req.params.id);
    if (!application) {
      application = await OrganizerApplication.findOne({ applicantId: req.params.id, status: "PENDING" });
    }

    if (!application) {
      return res.status(404).send("Application not found.");
    }

    // 2. Block self-rejection: admins cannot decide their own application
    if (application.applicantId.toString() === req.user._id.toString()) {
      return res.status(403).send("Forbidden: Administrators cannot reject their own organizer application.");
    }

    // 3. Atomic transition: update only if status is still PENDING
    const updatedApplication = await OrganizerApplication.findOneAndUpdate(
      { _id: application._id, status: "PENDING" },
      {
        status: "REJECTED",
        rejectionReason: trimmedReason,
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { returnDocument: "after" }
    );

    if (!updatedApplication) {
      return res.status(409).send("Application has already been reviewed or decided.");
    }

    // 4. Synchronize User record
    const applicant = await User.findById(updatedApplication.applicantId);
    if (applicant) {
      applicant.isOrganizer = false;
      applicant.organizerStatus = "REJECTED";
      await applicant.save();

      // 5. In-app Notification
      await Notification.create({
        userId: applicant._id,
        title: "Organizer Application Update",
        subtitle: `Your application for ${updatedApplication.organizationName} was not approved. Reason: ${trimmedReason}`,
        type: "danger",
        link: "/organizer/apply"
      });

      // 6. Send transactional email (wrapped so mail errors never fail the action)
      try {
        const safeReason = escapeHtml(trimmedReason);
        await sendMail({
          to: applicant.email,
          subject: "TeamForge: Organizer Application Decision",
          text: `Hello ${applicant.name},\n\nThank you for your interest in organizing campus hackathons on TeamForge. After review, your application for "${updatedApplication.organizationName}" could not be approved at this time.\n\nReason: ${trimmedReason}\n\nYou may reapply 7 days after this decision.\n\n- The TeamForge Team`,
          html: `<p>Hello <strong>${escapeHtml(applicant.name)}</strong>,</p><p>Thank you for your interest in organizing campus hackathons on TeamForge. After review, your application for <strong>${escapeHtml(updatedApplication.organizationName)}</strong> could not be approved at this time.</p><p><strong>Reason provided by administrator:</strong><br>${safeReason}</p><p>You are eligible to reapply 7 days after this decision.</p>`
        });
      } catch (emailErr) {
        console.error(`[Email] Failed to dispatch organizer rejection email to ${applicant.email}:`, emailErr.message);
      }
    }

    res.redirect("/admin/organizers");
  } catch (err) {
    console.error("Error rejecting organizer:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 6. POST /events/:id/promote - Event Promotion Toggle / Settings
// -------------------------------------------------------------
router.post("/events/:id/promote", requireLogin, async (req, res) => {
  try {
    const mongoose = require("mongoose");
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).send("Invalid event ID format.");
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    // Only approved organizers or admins can promote events
    if (!req.user.isAdmin && (!req.user.isOrganizer || req.user.organizerStatus !== "APPROVED")) {
      return res.status(403).send("Forbidden: Only approved organizers or administrators can promote events.");
    }

    // Strict ownership verification: Non-admin organizers can only promote their own events
    if (!req.user.isAdmin && (!event.createdBy || !event.createdBy.equals(req.user._id))) {
      return res.status(403).send("Forbidden: You can only configure promotion for events you created.");
    }

    const { isPromoted, promotedTagline, prizePool } = req.body;
    event.isPromoted = (isPromoted === "true" || isPromoted === "on" || isPromoted === true);
    if (promotedTagline !== undefined && typeof promotedTagline === "string") {
      event.promotedTagline = promotedTagline.trim();
    }
    if (prizePool !== undefined && typeof prizePool === "string") {
      event.prizePool = prizePool.trim();
    }

    await event.save();

    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("Error updating event promotion:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 7. GET /admin/stories - Admin review panel for Success Stories
// -------------------------------------------------------------
router.get("/admin/stories", requireLogin, requireAdmin, async (req, res) => {
  try {
    const pendingStories = await SuccessStory.find({ approved: false })
      .populate("createdBy", "name email department year")
      .populate("memberUserIds", "name department year")
      .sort({ createdAt: -1 });

    const approvedStories = await SuccessStory.find({ approved: true })
      .populate("createdBy", "name email department year")
      .populate("memberUserIds", "name department year")
      .sort({ createdAt: -1 });

    res.render("admin/stories", {
      pendingStories,
      approvedStories,
      currentUser: req.user
    });
  } catch (err) {
    console.error("Error loading admin stories panel:", err.message);
    res.status(500).send("Error loading admin stories panel.");
  }
});

// -------------------------------------------------------------
// 8. POST /admin/stories/:id/approve - Approve a success story
// -------------------------------------------------------------
router.post("/admin/stories/:id/approve", requireLogin, requireAdmin, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) {
      return res.status(404).send("Success story not found.");
    }

    story.approved = true;
    await story.save();

    await Notification.create({
      userId: story.createdBy,
      title: "Success Story Approved! 🏆",
      subtitle: `Your story for ${story.teamName} at ${story.eventName} has been approved and published to the campus dashboard.`,
      type: "success",
      link: "/dashboard"
    });

    res.redirect("/admin/stories");
  } catch (err) {
    console.error("Error approving success story:", err.message);
    res.status(400).send(err.message);
  }
});

// -------------------------------------------------------------
// 9. POST /admin/stories/:id/reject - Reject / Remove a success story
// -------------------------------------------------------------
router.post("/admin/stories/:id/reject", requireLogin, requireAdmin, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) {
      return res.status(404).send("Success story not found.");
    }

    await SuccessStory.findByIdAndDelete(req.params.id);

    await Notification.create({
      userId: story.createdBy,
      title: "Success Story Update",
      subtitle: `Your submitted story for ${story.teamName} was not approved for publication.`,
      type: "info",
      link: "/reviews"
    });

    res.redirect("/admin/stories");
  } catch (err) {
    console.error("Error rejecting success story:", err.message);
    res.status(400).send(err.message);
  }
});

module.exports = router;
