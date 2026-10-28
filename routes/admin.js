const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const TeamReview = require("../models/TeamReview");
const Feedback = require("../models/Feedback");
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const { removeEventPoster, deleteEventAndPoster } = require("../utils/eventService");
const requireLogin = require("../middleware/auth");

/**
 * Middleware ensuring user is an admin
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).send("Forbidden: Only campus administrators can access this section.");
  }
  next();
}

/**
 * Sanitize and format a CSV cell to prevent CSV Formula Injection.
 * Prefixes cells starting with '=', '+', '-', or '@' with a single quote (').
 */
function formatCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=\+\-@]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Helper to compute live platform metrics
 */
async function getPlatformStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    recentUsers,
    totalVerifiedUsers,
    recentVerifiedUsers,
    totalGithubVerified,
    recentGithubVerified,
    totalEvents,
    recentEvents,
    totalRequirements,
    recentRequirements,
    totalLockedTeams,
    recentLockedTeams,
    totalReviews,
    recentReviews,
    feedbackStats,
    actionStatuses
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    User.countDocuments({ isEmailVerified: true }),
    User.countDocuments({ isEmailVerified: true, createdAt: { $gte: sevenDaysAgo } }),
    User.countDocuments({ isGithubVerified: true }),
    User.countDocuments({ isGithubVerified: true, createdAt: { $gte: sevenDaysAgo } }),
    Event.countDocuments({}),
    Event.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    TeamRequirement.countDocuments({}),
    TeamRequirement.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    TeamRequestAction.countDocuments({ status: "LOCKED" }),
    TeamRequestAction.countDocuments({ status: "LOCKED", updatedAt: { $gte: sevenDaysAgo } }),
    TeamReview.countDocuments({}),
    TeamReview.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    Feedback.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          recent: {
            $sum: {
              $cond: [{ $gte: ["$createdAt", sevenDaysAgo] }, 1, 0]
            }
          }
        }
      }
    ]),
    TeamRequestAction.aggregate([
      {
        $group: {
          _id: { direction: "$direction", status: "$status" },
          total: { $sum: 1 },
          recent: {
            $sum: {
              $cond: [{ $gte: ["$updatedAt", sevenDaysAgo] }, 1, 0]
            }
          }
        }
      }
    ])
  ]);

  const actionMap = {};
  for (const item of actionStatuses) {
    const key = `${item._id.direction}_${item._id.status}`;
    actionMap[key] = { total: item.total, recent: item.recent };
  }

  const statuses = ["PENDING", "ACCEPTED", "CONFIRMED", "LOCKED", "DECLINED", "EXPIRED"];

  const inviteCounts = {};
  const applicationCounts = {};
  for (const s of statuses) {
    inviteCounts[s] = actionMap[`INVITE_${s}`] || { total: 0, recent: 0 };
    applicationCounts[s] = actionMap[`APPLY_${s}`] || { total: 0, recent: 0 };
  }

  const fbData = feedbackStats[0] || { total: 0, avgRating: 0, recent: 0 };

  return {
    sevenDaysAgo,
    users: {
      registered: { total: totalUsers, recent: recentUsers },
      verified: { total: totalVerifiedUsers, recent: recentVerifiedUsers },
      githubVerified: { total: totalGithubVerified, recent: recentGithubVerified }
    },
    events: { total: totalEvents, recent: recentEvents },
    requirements: { total: totalRequirements, recent: recentRequirements },
    lockedTeams: { total: totalLockedTeams, recent: recentLockedTeams },
    reviews: { total: totalReviews, recent: recentReviews },
    feedback: {
      total: fbData.total,
      recent: fbData.recent,
      avgRating: fbData.avgRating ? Number(fbData.avgRating.toFixed(2)) : 0
    },
    invites: inviteCounts,
    applications: applicationCounts
  };
}

// -------------------------------------------------------------
// 1. GET /admin/stats - Admin Live Platform Metrics
// -------------------------------------------------------------
router.get("/admin/stats", requireLogin, requireAdmin, async (req, res) => {
  try {
    const stats = await getPlatformStats();
    res.render("admin/stats", {
      currentUser: req.user,
      stats,
      pageTitle: "Platform Live Stats · Admin",
      hideSidebar: false
    });
  } catch (err) {
    console.error("Error loading admin stats:", err);
    res.status(500).render("500", {
      currentUser: req.user,
      pageTitle: "Server Error",
      errorMessage: "Failed to compile platform statistics."
    });
  }
});

// -------------------------------------------------------------
// 2. GET /admin/stats/export - CSV Export of Anonymous Stats
// -------------------------------------------------------------
router.get("/admin/stats/export", requireLogin, requireAdmin, async (req, res) => {
  try {
    const stats = await getPlatformStats();

    const rows = [
      ["Metric Category", "Specific Metric", "All-Time Total", "Last 7 Days"],
      ["Users", "Registered Users", stats.users.registered.total, stats.users.registered.recent],
      ["Users", "Email Verified Users", stats.users.verified.total, stats.users.verified.recent],
      ["Users", "GitHub Verified Profiles", stats.users.githubVerified.total, stats.users.githubVerified.recent],
      ["Events", "Campus Hackathon Events", stats.events.total, stats.events.recent],
      ["Requirements", "Open Team Requirements", stats.requirements.total, stats.requirements.recent],
      ["Matches", "Teams LOCKED (Confirmed Matches)", stats.lockedTeams.total, stats.lockedTeams.recent],
      ["Reviews", "Submitted Peer Reviews", stats.reviews.total, stats.reviews.recent],
      ["Feedback", "Total Feedback Submissions", stats.feedback.total, stats.feedback.recent],
      ["Feedback", "Average Satisfaction Rating (1-5)", stats.feedback.avgRating, "N/A"]
    ];

    const statuses = ["PENDING", "ACCEPTED", "CONFIRMED", "LOCKED", "DECLINED", "EXPIRED"];
    for (const s of statuses) {
      rows.push(["Invites", `Invitations (${s})`, stats.invites[s].total, stats.invites[s].recent]);
    }
    for (const s of statuses) {
      rows.push(["Applications", `Applications (${s})`, stats.applications[s].total, stats.applications[s].recent]);
    }

    const csvContent = rows
      .map(r => r.map(formatCsvCell).join(","))
      .join("\r\n");

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="teamforge-platform-stats-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error exporting stats CSV:", err);
    res.status(500).send("Failed to generate statistics CSV export.");
  }
});

// -------------------------------------------------------------
// 3. GET /admin/feedback - Admin Feedback Panel
// -------------------------------------------------------------
router.get("/admin/feedback", requireLogin, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 }).limit(200);
    const [avgData, totalCount, newCount] = await Promise.all([
      Feedback.aggregate([
        { $match: { rating: { $type: "number", $gte: 1, $lte: 5 } } },
        { $group: { _id: null, avgRating: { $avg: "$rating" }, ratedCount: { $sum: 1 } } }
      ]),
      Feedback.countDocuments({}),
      Feedback.countDocuments({ status: "new" })
    ]);

    const summary = avgData[0] || { avgRating: 0, ratedCount: 0 };
    const avgRatingVal = (summary && typeof summary.avgRating === "number" && !isNaN(summary.avgRating))
      ? Number(summary.avgRating.toFixed(2))
      : 0;

    res.render("admin/feedback", {
      currentUser: req.user,
      feedbacks,
      summary: {
        count: totalCount,
        ratedCount: summary.ratedCount || 0,
        avgRating: avgRatingVal,
        newCount
      },
      pageTitle: "Student Feedback · Admin"
    });
  } catch (err) {
    console.error("Error fetching feedback:", err);
    res.status(500).render("500", {
      currentUser: req.user,
      pageTitle: "Server Error",
      errorMessage: "Failed to load student feedback."
    });
  }
});

// -------------------------------------------------------------
// 3b. POST /admin/feedback/:id/resolve - Mark Feedback Resolved
// -------------------------------------------------------------
router.post("/admin/feedback/:id/resolve", requireLogin, requireAdmin, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      if (req.session) req.session.error = "Feedback entry not found.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(404).json({ error: "Feedback entry not found." });
      }
      return res.redirect("/admin/feedback");
    }

    feedback.status = "resolved";
    await feedback.save();

    if (req.session) {
      req.session.success = "Feedback item marked as resolved.";
    }

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, status: feedback.status });
    }
    res.redirect("/admin/feedback");
  } catch (err) {
    console.error("Error resolving feedback:", err);
    if (req.session) req.session.error = "Failed to update feedback status.";
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(500).json({ error: "Failed to update feedback status." });
    }
    res.redirect("/admin/feedback");
  }
});

// -------------------------------------------------------------
// 4. GET /admin/feedback/export - Anonymous CSV Feedback Export
// -------------------------------------------------------------
router.get("/admin/feedback/export", requireLogin, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });

    const rows = [
      ["Feedback ID", "Submission Date", "Rating (1-5)", "Category", "Page URL", "Status", "Student Comment"]
    ];

    feedbacks.forEach((fb, idx) => {
      const hasNumericRating = typeof fb.rating === "number" && !isNaN(fb.rating);
      rows.push([
        idx + 1,
        fb.createdAt.toISOString(),
        hasNumericRating ? fb.rating : "",
        fb.category || "general",
        fb.pageUrl || "",
        fb.status || "new",
        (fb.comment || "").replace(/[\r\n]+/g, " ")
      ]);
    });

    const csvContent = rows
      .map(r => r.map(formatCsvCell).join(","))
      .join("\r\n");

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="teamforge-feedback-anonymous-${dateStr}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error exporting feedback CSV:", err);
    res.status(500).send("Failed to generate feedback CSV export.");
  }
});

// -------------------------------------------------------------
// 5. GET /admin/banner - Manage Event-Day Announcement Banner
// -------------------------------------------------------------
router.get("/admin/banner", requireLogin, requireAdmin, async (req, res) => {
  try {
    const currentBanner = await Announcement.findOne().sort({ createdAt: -1 });
    res.render("admin/banner", {
      currentUser: req.user,
      banner: currentBanner,
      pageTitle: "Event-Day Announcement Banner · Admin"
    });
  } catch (err) {
    console.error("Error loading banner management:", err);
    res.status(500).render("500", {
      currentUser: req.user,
      pageTitle: "Server Error",
      errorMessage: "Failed to load banner settings."
    });
  }
});

// -------------------------------------------------------------
// 6. POST /admin/banner - Create or Update Pinned Banner
// -------------------------------------------------------------
router.post("/admin/banner", requireLogin, requireAdmin, async (req, res) => {
  try {
    const { title, text, expiresAt, active } = req.body;

    if (!title || !title.trim() || !text || !text.trim()) {
      req.session.error = "Banner title and announcement text are required.";
      return res.redirect("/admin/banner");
    }

    if (!expiresAt) {
      req.session.error = "Please specify an expiration date/time for the banner.";
      return res.redirect("/admin/banner");
    }

    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      req.session.error = "Invalid expiration date.";
      return res.redirect("/admin/banner");
    }

    // Upsert or create single active announcement
    let banner = await Announcement.findOne().sort({ createdAt: -1 });
    if (!banner) {
      banner = new Announcement({ createdBy: req.user._id });
    }

    banner.title = title.trim();
    banner.text = text.trim();
    banner.expiresAt = expiryDate;
    banner.active = active === "on" || active === "true" || active === true;
    banner.createdBy = req.user._id;

    await banner.save();

    req.session.success = banner.active
      ? "Event-day announcement successfully pinned to the dashboard!"
      : "Announcement updated (currently inactive).";

    res.redirect("/admin/banner");
  } catch (err) {
    console.error("Error saving banner:", err);
    req.session.error = "Failed to update pinned banner: " + err.message;
    res.redirect("/admin/banner");
  }
});

// -------------------------------------------------------------
// 7. POST /admin/banner/clear - Deactivate Current Banner
// -------------------------------------------------------------
router.post("/admin/banner/clear", requireLogin, requireAdmin, async (req, res) => {
  try {
    await Announcement.updateMany({}, { $set: { active: false } });
    req.session.success = "Pinned announcement banner has been deactivated.";
    res.redirect("/admin/banner");
  } catch (err) {
    console.error("Error clearing banner:", err);
    req.session.error = "Failed to clear banner: " + err.message;
    res.redirect("/admin/banner");
  }
});

// -------------------------------------------------------------
// 8. POST /admin/events/:id/poster/remove - Admin remove event poster
// -------------------------------------------------------------
router.post("/admin/events/:id/poster/remove", requireLogin, requireAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      if (req.session) req.session.error = "Event not found.";
      return res.redirect("/events");
    }

    await removeEventPoster(event._id);

    if (event.createdBy && !event.createdBy.equals(req.user._id)) {
      await Notification.create({
        userId: event.createdBy,
        type: "warning",
        title: "Event poster removed by administrator",
        subtitle: `The poster for your event "${event.name}" was removed by an administrator for moderation.`,
        link: `/events/${event._id}`,
        read: false
      });
    }

    if (req.session) req.session.success = "Event poster successfully removed.";
    const referer = req.headers.referer || `/events/${event._id}`;
    res.redirect(referer);
  } catch (err) {
    console.error("Error removing event poster by admin:", err);
    if (req.session) req.session.error = "Failed to remove poster: " + err.message;
    res.redirect("/events");
  }
});

// -------------------------------------------------------------
// 9. POST /admin/events/:id/delete - Admin delete event cascade
// -------------------------------------------------------------
router.post("/admin/events/:id/delete", requireLogin, requireAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      if (req.session) req.session.error = "Event not found.";
      return res.redirect("/events");
    }

    await deleteEventAndPoster(event._id);
    if (req.session) req.session.success = `Event "${event.name}" and associated poster deleted.`;
    res.redirect("/events");
  } catch (err) {
    console.error("Error deleting event by admin:", err);
    if (req.session) req.session.error = "Failed to delete event: " + err.message;
    res.redirect("/events");
  }
});

router.formatCsvCell = formatCsvCell;
module.exports = router;
