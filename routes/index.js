const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Invite = require('../models/Invite');
const TeamRequirement = require('../models/TeamRequirement');
const Application = require('../models/Application');
const TeamRequestAction = require('../models/TeamRequestAction');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const { getRecommendedCandidates, getRecommendedOpportunities } = require('../utils/recommendations');
const { checkTimeoutsAndExpiries } = require('../utils/actionStateMachine');
const requireLogin = require('../middleware/auth');

// -------------------------------------------------------------
// 1. GET / - Dashboard (Protected)
// -------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;

    // Check timeouts, reminders, and auto-expiries
    try {
      await checkTimeoutsAndExpiries();
    } catch (e) {
      console.warn("Error running timeout check on dashboard:", e.message);
    }

    // 1. Get the active team requirement owned by this user
    let latestTeam = null;
    if (req.query.teamId) {
      latestTeam = await TeamRequirement.findById(req.query.teamId);
      // Ensure the team belongs to this user
      if (latestTeam && latestTeam.createdBy && !latestTeam.createdBy.equals(currentUser._id)) {
        latestTeam = null;
      }
    }

    if (!latestTeam) {
      // Find latest team created by the current user
      latestTeam = await TeamRequirement.findOne({ createdBy: currentUser._id }).sort({ createdAt: -1 });
    }

    // 2. Calculate recommended candidates for the active team's primary open role
    let recommendedCandidates = [];
    if (latestTeam && latestTeam.roles && latestTeam.roles.length > 0) {
      const activeRole = latestTeam.roles[0];
      recommendedCandidates = await getRecommendedCandidates(latestTeam, activeRole, currentUser._id);
    }

    // 3. Calculate recommended opportunities for the logged-in user
    let recommendedOpportunities = [];
    if (currentUser) {
      recommendedOpportunities = await getRecommendedOpportunities(currentUser);
    }

    // 4. Retrieve applications submitted by the logged-in user (direction: APPLY)
    const myApplications = await TeamRequestAction.find({ senderId: currentUser._id, direction: "APPLY" })
      .populate("teamRequirementId")
      .populate("receiverId", "name email department role github linkedin portfolio skills")
      .sort({ createdAt: -1 });

    // 5. Count applications received for the active team requirement
    let teamApplicationCount = 0;
    if (latestTeam) {
      teamApplicationCount = await TeamRequestAction.countDocuments({ teamRequirementId: latestTeam._id, direction: "APPLY" });
    }

    // 6. Retrieve invites sent by this user (direction: INVITE)
    const sentInvites = await TeamRequestAction.find({ senderId: currentUser._id, direction: "INVITE" })
      .populate("receiverId", "name email department role github linkedin portfolio skills")
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    // 7. Retrieve invites received by this user (direction: INVITE)
    const receivedInvites = await TeamRequestAction.find({
      receiverId: currentUser._id,
      direction: "INVITE",
      status: { $in: ["PENDING", "ACCEPTED", "LOCKED"] }
    })
      .populate("senderId", "name email department role github linkedin portfolio skills")
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    // 8. Actions awaiting requester's confirmation (senderId is currentUser, status is ACCEPTED)
    const awaitingConfirmation = await TeamRequestAction.find({
      senderId: currentUser._id,
      status: "ACCEPTED"
    })
      .populate("receiverId", "name email department role")
      .populate("teamRequirementId")
      .sort({ updatedAt: -1 });

    // 9. Promoted Hackathons & Competitions
    const promotedEvents = await Event.find({ isPromoted: true }).sort({ date: 1 }).limit(3);

    res.render("home", {
      latestTeam,
      recommendedCandidates,
      recommendedOpportunities,
      myApplications,
      teamApplicationCount,
      sentInvites,
      receivedInvites,
      awaitingConfirmation,
      promotedEvents,
      currentUser
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error.message);
    res.render("home", {
      latestTeam: null,
      recommendedCandidates: [],
      recommendedOpportunities: [],
      myApplications: [],
      teamApplicationCount: 0,
      sentInvites: [],
      receivedInvites: [],
      awaitingConfirmation: [],
      promotedEvents: [],
      currentUser: req.user || null
    });
  }
});

// -------------------------------------------------------------
// 2. GET /discover - Explore Opportunities (Protected by requireLogin)
// -------------------------------------------------------------
router.get("/discover", requireLogin, async (req, res) => {
  try {
    const teamRequirements = await TeamRequirement.find().sort({ createdAt: -1 });
    const currentUser = req.user;
    const recommendedOpportunities = currentUser ? await getRecommendedOpportunities(currentUser) : [];
    res.render("discover", { teamRequirements, recommendedOpportunities, currentUser });
  } catch (error) {
    console.error("Error fetching team requirements for discover:", error.message);
    res.render("discover", { teamRequirements: [], recommendedOpportunities: [], currentUser: req.user || null });
  }
});

// -------------------------------------------------------------
// 3. GET /notifications - User Notifications (Protected)
// -------------------------------------------------------------
router.get("/notifications", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;

    // Check timeouts, reminders, and auto-expiries
    try {
      await checkTimeoutsAndExpiries();
    } catch (e) {
      console.warn("Error running timeout check on notifications:", e.message);
    }

    // Retrieve persistent notifications
    const dbNotifs = await Notification.find({ userId: currentUser._id }).sort({ createdAt: -1 });

    const notifications = dbNotifs.map(n => ({
      _id: n._id,
      title: n.title,
      subtitle: n.subtitle,
      time: new Date(n.createdAt).toLocaleDateString() + ' ' + new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: n.type,
      link: n.link || "/",
      read: n.read
    }));

    res.render("notifications", { notifications, currentUser });
  } catch (err) {
    console.error("Error loading notifications:", err.message);
    res.render("notifications", { notifications: [], currentUser: null });
  }
});

// -------------------------------------------------------------
// 3b. POST /notifications/mark-read - Mark all notifications as read
// -------------------------------------------------------------
router.post("/notifications/mark-read", requireLogin, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true });
    }
    res.redirect("/notifications");
  } catch (err) {
    console.error("Error marking notifications as read:", err.message);
    res.redirect("/notifications");
  }
});

// -------------------------------------------------------------
// 4. GET /profile - View Current User Profile (Protected)
// -------------------------------------------------------------
router.get("/profile", requireLogin, (req, res) => {
  res.render("profile", { currentUser: req.user, welcome: req.query.welcome === "true" });
});

// -------------------------------------------------------------
// 5. GET /profile/edit - Edit Profile Form (Protected)
// -------------------------------------------------------------
router.get("/profile/edit", requireLogin, (req, res) => {
  res.render("profile-edit", { currentUser: req.user, error: null });
});

// -------------------------------------------------------------
// 6. POST /profile/edit - Save Profile Changes (Protected)
// -------------------------------------------------------------
router.post("/profile/edit", requireLogin, async (req, res) => {
  try {
    const user = req.user;
    const {
      name,
      role,
      department,
      year,
      bio,
      github,
      linkedin,
      portfolio,
      availability,
      isProfileHidden,
      skills,
      projectsRaw,
      pastHackathonsRaw
    } = req.body;

    if (name && name.trim()) user.name = name.trim();
    if (role && role.trim()) user.role = role.trim();
    if (department !== undefined) user.department = department.trim();
    if (year !== undefined) user.year = year.trim();
    if (bio !== undefined) user.bio = bio.trim();
    if (github !== undefined) user.github = github.trim();
    if (linkedin !== undefined) user.linkedin = linkedin.trim();
    if (portfolio !== undefined) user.portfolio = portfolio.trim();

    // Availability parsing (1.0 = Free, 0.5 = Partly free, 0.0 = Busy)
    if (availability !== undefined && availability !== null) {
      if (typeof availability === 'string') {
        const lower = availability.toLowerCase();
        if (lower.includes('busy') || lower.includes('not')) {
          user.availability = 0.0;
        } else if (lower.includes('look') || lower.includes('part')) {
          user.availability = 0.5;
        } else if (!isNaN(parseFloat(availability))) {
          user.availability = Math.min(1.0, Math.max(0.0, parseFloat(availability)));
        } else {
          user.availability = 1.0;
        }
      } else if (typeof availability === 'number') {
        user.availability = Math.min(1.0, Math.max(0.0, availability));
      }
    }

    // Hide profile toggle
    user.isProfileHidden = (isProfileHidden === "true" || isProfileHidden === "on" || isProfileHidden === true);

    // Parse skills
    if (skills) {
      if (typeof skills === 'string') {
        const skillItems = skills.split(',').map(s => s.trim()).filter(Boolean);
        user.skills = skillItems.map(item => {
          if (item.includes(':')) {
            const parts = item.split(':');
            return {
              name: parts[0].trim(),
              level: Math.min(5, Math.max(1, parseInt(parts[1], 10) || 3))
            };
          }
          return {
            name: item,
            level: 3
          };
        });
      }
    }

    // Parse Projects
    if (projectsRaw) {
      try {
        if (typeof projectsRaw === "string" && projectsRaw.trim().startsWith("[")) {
          user.projects = JSON.parse(projectsRaw);
        } else if (typeof projectsRaw === "string") {
          const lines = projectsRaw.split("\n").filter(l => l.trim());
          user.projects = lines.map(line => {
            const [title, desc, link, tech] = line.split("|").map(s => s?.trim());
            return {
              title: title || "Project",
              description: desc || "",
              link: link || "",
              techStack: tech || ""
            };
          });
        }
      } catch (e) {
        console.warn("Failed to parse projects:", e.message);
      }
    }

    // Parse Past Hackathons
    if (pastHackathonsRaw) {
      try {
        if (typeof pastHackathonsRaw === "string" && pastHackathonsRaw.trim().startsWith("[")) {
          user.pastHackathons = JSON.parse(pastHackathonsRaw);
        } else if (typeof pastHackathonsRaw === "string") {
          const lines = pastHackathonsRaw.split("\n").filter(l => l.trim());
          user.pastHackathons = lines.map(line => {
            const [name, yearVal, proj, roleVal, place] = line.split("|").map(s => s?.trim());
            return {
              name: name || "Hackathon",
              year: yearVal || "",
              projectTitle: proj || "",
              role: roleVal || "",
              placement: place || ""
            };
          });
        }
      } catch (e) {
        console.warn("Failed to parse past hackathons:", e.message);
      }
    }

    user.lastActive = new Date();
    await user.save();
    console.log(`Profile updated for user: ${user.email} (completeness: ${user.completenessPercentage}%)`);
    res.redirect("/profile");
  } catch (err) {
    console.error("Error updating profile:", err.message);
    res.render("profile-edit", {
      currentUser: req.user,
      error: `Failed to update profile: ${err.message}`
    });
  }
});

module.exports = router;
