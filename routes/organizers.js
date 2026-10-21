const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/Event");
const Notification = require("../models/Notification");
const requireLogin = require("../middleware/auth");

/**
 * Middleware ensuring user is an admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).send("Forbidden: Only administrators can access this section.");
  }
  next();
}

// -------------------------------------------------------------
// 1. GET /organizer/apply - Apply for Organizer status
// -------------------------------------------------------------
router.get("/organizer/apply", requireLogin, (req, res) => {
  res.render("organizers/apply", {
    currentUser: req.user,
    error: null,
    success: req.query.success === "true"
  });
});

// -------------------------------------------------------------
// 2. POST /organizer/apply - Submit organizer request
// -------------------------------------------------------------
router.post("/organizer/apply", requireLogin, async (req, res) => {
  try {
    const { organizationName, organizerReason } = req.body;

    if (!organizationName || !organizationName.trim()) {
      return res.render("organizers/apply", {
        currentUser: req.user,
        error: "Organization/Club name is required.",
        success: false
      });
    }

    req.user.organizationName = organizationName.trim();
    req.user.organizerReason = (organizerReason || "").trim();
    req.user.organizerStatus = "PENDING";
    await req.user.save();

    res.redirect("/organizer/apply?success=true");
  } catch (err) {
    console.error("Error submitting organizer application:", err.message);
    res.render("organizers/apply", {
      currentUser: req.user,
      error: err.message,
      success: false
    });
  }
});

// -------------------------------------------------------------
// 3. GET /admin/organizers - Admin review panel
// -------------------------------------------------------------
router.get("/admin/organizers", requireLogin, requireAdmin, async (req, res) => {
  try {
    const pendingOrganizers = await User.find({ organizerStatus: "PENDING" }).sort({ updatedAt: -1 });
    const approvedOrganizers = await User.find({ organizerStatus: "APPROVED" }).sort({ updatedAt: -1 });
    const rejectedOrganizers = await User.find({ organizerStatus: "REJECTED" }).sort({ updatedAt: -1 });

    res.render("admin/organizers", {
      pendingOrganizers,
      approvedOrganizers,
      rejectedOrganizers,
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
    const applicant = await User.findById(req.params.id);
    if (!applicant) {
      return res.status(404).send("Applicant not found.");
    }

    applicant.isOrganizer = true;
    applicant.organizerStatus = "APPROVED";
    await applicant.save();

    // Notify student
    await Notification.create({
      userId: applicant._id,
      title: "Organizer Account Approved! 🎖️",
      subtitle: `Your organizer account for ${applicant.organizationName || 'your club'} has been approved by admin. You can now publish and promote hackathon events.`,
      type: "success",
      link: "/events"
    });

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
    const applicant = await User.findById(req.params.id);
    if (!applicant) {
      return res.status(404).send("Applicant not found.");
    }

    applicant.isOrganizer = false;
    applicant.organizerStatus = "REJECTED";
    await applicant.save();

    await Notification.create({
      userId: applicant._id,
      title: "Organizer Application Update",
      subtitle: `Your application for organizer status could not be approved at this time.`,
      type: "danger",
      link: "/organizer/apply"
    });

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
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    // Only approved organizers or admins can promote events
    if (!req.user.isAdmin && (!req.user.isOrganizer || req.user.organizerStatus !== "APPROVED")) {
      return res.status(403).send("Forbidden: Only approved organizers or administrators can promote events.");
    }

    const { isPromoted, promotedTagline, prizePool } = req.body;
    event.isPromoted = (isPromoted === "true" || isPromoted === "on" || isPromoted === true);
    if (promotedTagline !== undefined) event.promotedTagline = promotedTagline.trim();
    if (prizePool !== undefined) event.prizePool = prizePool.trim();

    await event.save();

    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("Error updating event promotion:", err.message);
    res.status(400).send(err.message);
  }
});

module.exports = router;
