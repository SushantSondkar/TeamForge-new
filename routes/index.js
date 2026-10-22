const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Invite = require('../models/Invite');
const TeamRequirement = require('../models/TeamRequirement');
const Application = require('../models/Application');
const TeamRequestAction = require('../models/TeamRequestAction');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const SuccessStory = require('../models/SuccessStory');
const {
  getRecommendedCandidates,
  getRecommendedOpportunities,
  searchTeamRequirements,
  getAvailableFilterOptions
} = require('../utils/recommendations');
const requireLogin = require('../middleware/auth');

const ALLOWED_DEPARTMENTS = [
  "Computer Engineering",
  "Information Technology",
  "AI & Data Science",
  "Electronics & Telecom",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering"
];
const ALLOWED_YEARS = ["FE", "SE", "TE", "BE"];

// -------------------------------------------------------------
// Dashboard Rendering Helper Function
// -------------------------------------------------------------
async function renderDashboard(req, res) {
  try {
    const currentUser = req.user;

    // 1. Get the active team requirement owned by this user
    let latestTeam = null;
    if (req.query.teamId && mongoose.isValidObjectId(req.query.teamId)) {
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

    // 2. Calculate recommended candidates for the active team's primary open role (supports Find People search)
    let recommendedCandidates = [];
    const candidateSkill = req.query.candidateSkill ? String(req.query.candidateSkill).trim() : "";
    const minLevel = req.query.minLevel ? String(req.query.minLevel).trim() : "1";
    if (latestTeam && latestTeam.roles && latestTeam.roles.length > 0) {
      const activeRole = latestTeam.roles[0];
      recommendedCandidates = await getRecommendedCandidates(latestTeam, activeRole, currentUser._id, {
        skill: candidateSkill,
        minLevel: minLevel
      });
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

    // 10. Real upcoming deadlines from database
    const upcomingDeadlines = await Event.find().sort({ deadline: 1 }).limit(4);

    // 11. Real active member count (1 creator + locked candidates)
    let activeMemberCount = 1;
    if (latestTeam) {
      const lockedCount = await TeamRequestAction.countDocuments({
        teamRequirementId: latestTeam._id,
        status: "LOCKED"
      });
      activeMemberCount = 1 + lockedCount;
    }

    // 12. Approved Hackathon Success Stories
    const successStories = await SuccessStory.find({ approved: true })
      .populate("createdBy", "name department year")
      .populate("memberUserIds", "name department year")
      .sort({ createdAt: -1 })
      .limit(6);

    res.render("home", {
      latestTeam,
      activeMemberCount,
      recommendedCandidates,
      recommendedOpportunities,
      myApplications,
      teamApplicationCount,
      sentInvites,
      receivedInvites,
      awaitingConfirmation,
      promotedEvents,
      upcomingDeadlines,
      successStories,
      candidateSkill,
      minLevel,
      currentUser
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error.message);
    res.render("home", {
      latestTeam: null,
      activeMemberCount: 1,
      recommendedCandidates: [],
      recommendedOpportunities: [],
      myApplications: [],
      teamApplicationCount: 0,
      sentInvites: [],
      receivedInvites: [],
      awaitingConfirmation: [],
      promotedEvents: [],
      upcomingDeadlines: [],
      successStories: [],
      currentUser: req.user || null
    });
  }
}

// -------------------------------------------------------------
// 1. GET / - Public Landing Page
// -------------------------------------------------------------
router.get("/", (req, res) => {
  return res.render("landing", {
    currentUser: req.user || null,
    hideSidebar: true,
    pageTitle: "Find Your People. Build Something Great."
  });
});

// -------------------------------------------------------------
// 1b. GET /dashboard - Explicit Dashboard Route (Protected)
// -------------------------------------------------------------
router.get("/dashboard", requireLogin, async (req, res) => {
  return renderDashboard(req, res);
});

// -------------------------------------------------------------
// 1c. GET /landing - Explicit Public Landing Page Route
// -------------------------------------------------------------
router.get("/landing", (req, res) => {
  return res.render("landing", {
    currentUser: req.user || null,
    hideSidebar: true,
    pageTitle: "Find Your People. Build Something Great."
  });
});

// -------------------------------------------------------------
// 1d. GET /how-it-works - In-App How TeamForge Works (4 Steps)
// -------------------------------------------------------------
router.get("/how-it-works", (req, res) => {
  return res.render("how-it-works", {
    currentUser: req.user || null,
    pageTitle: "How TeamForge Works · Campus Teaming in 4 Steps"
  });
});

// -------------------------------------------------------------
// 2. GET /discover - Explore Opportunities with Server-Side Search & Filters
// -------------------------------------------------------------
router.get("/discover", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    const { tab, q, skill, role, event, page } = req.query;

    // Determine active tab
    let activeTab = "smart-recs";
    if (tab === "search" || q !== undefined || skill !== undefined || role !== undefined || event !== undefined || page !== undefined) {
      activeTab = "search";
    } else if (tab === "events" || tab === "browse-events") {
      activeTab = "browse-events";
    } else if (tab) {
      activeTab = tab;
    }

    // 1. Fetch available filter options dynamically from real open requirements & upcoming events
    const { availableSkills, availableRoles, availableEvents } = await getAvailableFilterOptions();

    // 2. Server-side search & filtering with pagination (10 per page)
    const searchResults = await searchTeamRequirements({
      currentUser,
      q: q || "",
      skill: skill || "",
      role: role || "",
      event: event || "",
      page: page || 1,
      limit: 10
    });

    // 3. Recommended opportunities for smart recommendations tab
    const recommendedOpportunities = currentUser ? await getRecommendedOpportunities(currentUser) : [];

    // Helper to generate pagination URLs preserving all active filters
    function buildFilterUrl(targetPage) {
      const params = new URLSearchParams();
      params.set("tab", "search");
      if (q) params.set("q", q);
      if (skill) params.set("skill", skill);
      if (role) params.set("role", role);
      if (event) params.set("event", event);
      params.set("page", targetPage);
      return "/discover?" + params.toString();
    }

    res.render("discover", {
      activeTab,
      q: q ? String(q) : "",
      selectedSkill: skill ? String(skill) : "",
      selectedRole: role ? String(role) : "",
      selectedEvent: event ? String(event) : "",
      searchResults,
      availableSkills,
      availableRoles,
      availableEvents,
      events: availableEvents,
      recommendedOpportunities,
      buildFilterUrl,
      currentUser
    });
  } catch (error) {
    console.error("Error fetching discover search results:", error.message);
    res.render("discover", {
      activeTab: "search",
      q: "",
      selectedSkill: "",
      selectedRole: "",
      selectedEvent: "",
      searchResults: { results: [], totalCount: 0, currentPage: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      availableSkills: [],
      availableRoles: [],
      availableEvents: [],
      events: [],
      recommendedOpportunities: [],
      buildFilterUrl: () => "/discover",
      currentUser: req.user || null
    });
  }
});

// -------------------------------------------------------------
// 3. GET /notifications - User Notifications (Protected)
// -------------------------------------------------------------
router.get("/notifications", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;

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
      emailNotifications,
      skills,
      projectsRaw,
      pastHackathonsRaw
    } = req.body;

    if (name && name.trim()) user.name = name.trim();
    if (role && role.trim()) user.role = role.trim();
    if (department !== undefined) {
      const cleanDept = department.trim();
      if (!cleanDept || ALLOWED_DEPARTMENTS.includes(cleanDept)) {
        user.department = cleanDept;
      }
    }
    if (year !== undefined) {
      const cleanYear = year.trim();
      if (!cleanYear || ALLOWED_YEARS.includes(cleanYear)) {
        user.year = cleanYear;
      }
    }
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

    // Email notifications toggle (default true; when unchecked in form, undefined -> false)
    user.emailNotifications = (emailNotifications === "true" || emailNotifications === "on" || emailNotifications === true);

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
    console.log(`Profile updated for user ID: ${user._id} (completeness: ${user.completenessPercentage}%)`);
    req.session.success = "Profile saved successfully!";
    res.redirect("/profile?success=" + encodeURIComponent("Profile saved successfully!"));
  } catch (err) {
    console.error("Error updating profile:", err.message);
    req.session.error = `Failed to update profile: ${err.message}`;
    res.render("profile-edit", {
      currentUser: req.user,
      error: `Failed to update profile: ${err.message}`
    });
  }
});

module.exports = router;
