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
const { formatDateTime } = require('../utils/dateUtils');
const requireLogin = require('../middleware/auth');
const { actionLimiter } = require('../middleware/rateLimiters');

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
      .populate("receiverId", "name email phone department role github linkedin portfolio skills")
      .sort({ createdAt: -1 });

    // 5. Count applications received for the active team requirement
    let teamApplicationCount = 0;
    if (latestTeam) {
      teamApplicationCount = await TeamRequestAction.countDocuments({ teamRequirementId: latestTeam._id, direction: "APPLY" });
    }

    // 6. Retrieve invites sent by this user (direction: INVITE)
    const sentInvites = await TeamRequestAction.find({ senderId: currentUser._id, direction: "INVITE" })
      .populate("receiverId", "name email phone department role github linkedin portfolio skills")
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    // 7. Retrieve invites received by this user (direction: INVITE)
    const receivedInvites = await TeamRequestAction.find({
      receiverId: currentUser._id,
      direction: "INVITE",
      status: { $in: ["PENDING", "ACCEPTED", "LOCKED"] }
    })
      .populate("senderId", "name email phone department role github linkedin portfolio skills")
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    // Strip phone numbers unless the match is LOCKED and BOTH teammates opted in
    myApplications.forEach(app => {
      const isLockedMutual = app.status === "LOCKED" && Boolean(app.senderContactOptIn && app.receiverContactOptIn);
      if (!isLockedMutual && app.receiverId) {
        app.receiverId.phone = undefined;
      }
    });
    sentInvites.forEach(inv => {
      const isLockedMutual = inv.status === "LOCKED" && Boolean(inv.senderContactOptIn && inv.receiverContactOptIn);
      if (!isLockedMutual && inv.receiverId) {
        inv.receiverId.phone = undefined;
      }
    });
    receivedInvites.forEach(inv => {
      const isLockedMutual = inv.status === "LOCKED" && Boolean(inv.senderContactOptIn && inv.receiverContactOptIn);
      if (!isLockedMutual && inv.senderId) {
        inv.senderId.phone = undefined;
      }
    });

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

/**
 * Helper to determine a safe relative link for a notification.
 * Resolves links at display time if missing/empty or stored as "/",
 * strictly disallows external URLs, and falls back to /notifications (never "/").
 */
function resolveSafeNotificationLink(n, currentUserId) {
  let link = n.link ? String(n.link).trim() : "";

  function isValidPath(url) {
    if (!url || typeof url !== "string") return false;
    if (!url.startsWith("/")) return false;
    if (url.startsWith("//")) return false; // Block protocol-relative URLs
    if (url.includes("://") || url.includes("javascript:") || url.includes("data:")) return false;
    return true;
  }

  // If a valid non-root relative link was stored, use it
  if (link && link !== "/" && isValidPath(link)) {
    return link;
  }

  // Work out link from notification type / content at display time
  const type = n.type || "info";
  const title = (n.title || "").toLowerCase();
  const action = n.actionId; // populated or raw

  // 1. Invite accepted
  if (title.includes("accepted your invite") || (title.includes("accepted") && title.includes("invite"))) {
    const teamId = action?.teamRequirementId?._id || action?.teamRequirementId;
    if (teamId) {
      return `/applications/team/${teamId}#tab-sent-invitations`;
    }
    return "/actions";
  }

  // 2. Application accepted
  if (title.includes("application") && title.includes("accepted")) {
    return "/dashboard";
  }

  // 3. Match confirmed & locked
  if (title.includes("match confirmed") || (title.includes("locked") && !title.includes("contact"))) {
    return "/actions";
  }

  // 4. Contact sharing unlocked
  if (title.includes("contact sharing") || title.includes("contact details")) {
    if (action) {
      const teamId = action.teamRequirementId?._id || action.teamRequirementId;
      const teamCreatedBy = action.teamRequirementId?.createdBy;
      if (teamId && teamCreatedBy && currentUserId && teamCreatedBy.toString() === currentUserId.toString()) {
        return `/applications/team/${teamId}`;
      }
      if (action.direction === "INVITE" && action.senderId && currentUserId && action.senderId.toString() === currentUserId.toString()) {
        return teamId ? `/applications/team/${teamId}` : "/dashboard";
      }
    }
    return "/dashboard";
  }

  // 5. Incoming invite
  if (type === "invite") {
    return "/dashboard";
  }

  // 6. Common platform notification types
  if (title.includes("organizer")) {
    return "/organizer/apply";
  }
  if (title.includes("success story") || title.includes("story")) {
    return "/admin/stories";
  }
  if (title.includes("review")) {
    return "/reviews";
  }
  if (title.includes("welcome") || title.includes("credibility") || title.includes("profile")) {
    return "/profile";
  }

  if (action?.teamRequirementId) {
    const teamId = action.teamRequirementId._id || action.teamRequirementId;
    return `/applications/team/${teamId}`;
  }

  if (action) {
    return "/dashboard";
  }

  // If it can't be worked out, go to /notifications, never "/"
  return "/notifications";
}

// -------------------------------------------------------------
// 3. GET /notifications - User Notifications (Protected)
// -------------------------------------------------------------
router.get("/notifications", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;

    // Retrieve persistent notifications with action details populated
    const dbNotifs = await Notification.find({ userId: currentUser._id })
      .populate({
        path: "actionId",
        populate: { path: "teamRequirementId" }
      })
      .sort({ createdAt: -1 });

    const notifications = dbNotifs.map(n => ({
      _id: n._id,
      title: n.title,
      subtitle: n.subtitle,
      time: formatDateTime(n.createdAt),
      type: n.type,
      link: resolveSafeNotificationLink(n, currentUser._id),
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
// 3c. POST /notifications/:id/read or mark-read - Mark a single notification as read
// -------------------------------------------------------------
router.post(["/notifications/:id/read", "/notifications/:id/mark-read"], requireLogin, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true } },
      { returnDocument: 'after' }
    );
    if (req.xhr || req.headers.accept?.includes("application/json") || req.headers["content-type"]?.includes("application/json")) {
      return res.json({ success: true, notification: notif });
    }
    res.redirect("/notifications");
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ error: err.message });
    }
    res.redirect("/notifications");
  }
});

// -------------------------------------------------------------
// 3d. GET /notifications/:id/view - Mark as read & redirect to relevant link
// -------------------------------------------------------------
router.get("/notifications/:id/view", requireLogin, async (req, res) => {
  try {
    const notif = await Notification.findOne({ _id: req.params.id, userId: req.user._id })
      .populate({
        path: "actionId",
        populate: { path: "teamRequirementId" }
      });
    if (!notif) {
      return res.redirect("/notifications");
    }
    if (!notif.read) {
      notif.read = true;
      await notif.save();
    }
    const safeLink = resolveSafeNotificationLink(notif, req.user._id);
    res.redirect(safeLink);
  } catch (err) {
    res.redirect("/notifications");
  }
});

// -------------------------------------------------------------
// 3e. GET /actions - User Matches & Actions Dashboard Redirect
// -------------------------------------------------------------
router.get("/actions", requireLogin, (req, res) => {
  res.redirect("/dashboard");
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

/**
 * Maximum string length for base64 photo data URI:
 * 300 KB binary = 409,600 chars of base64 + ~30 chars prefix = ~409,630 chars.
 * Any string over 450,000 characters is rejected immediately before decoding.
 */
const MAX_PHOTO_STRING_LENGTH = 450000;
const STRICT_BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Helper to validate uploaded photo base64 strings:
 * - Checks maximum string length BEFORE decoding (early rejection)
 * - Checks strict base64 character set BEFORE decoding (early rejection)
 * - Accepts data:image/jpeg, data:image/png, data:image/webp base64 strings
 * - Decodes buffer and verifies magic bytes match declared format
 * - Rejects anything over 300 KB decoded with friendly error
 */
function validateBase64Photo(dataUri) {
  if (!dataUri || typeof dataUri !== 'string') {
    return { valid: false, error: "No photo data provided" };
  }

  // 1. Check maximum string length BEFORE regex or decoding
  if (dataUri.length > MAX_PHOTO_STRING_LENGTH) {
    return {
      valid: false,
      error: "Photo exceeds the maximum allowed payload size limit. Please choose an image smaller than 300 KB."
    };
  }

  // 2. Validate prefix format (wrong prefix check)
  const mimeMatch = dataUri.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/s);
  if (!mimeMatch) {
    return {
      valid: false,
      error: "Invalid image format. Only JPEG, PNG, or WebP images are allowed."
    };
  }

  const declaredMime = mimeMatch[1].toLowerCase();
  const rawBase64 = mimeMatch[3].replace(/\s/g, "");

  // 3. Check against strict base64 regex BEFORE decoding (garbage input check)
  if (rawBase64.length % 4 !== 0 || !STRICT_BASE64_REGEX.test(rawBase64)) {
    return {
      valid: false,
      error: "Photo data is corrupted or contains invalid base64 characters."
    };
  }

  if (rawBase64.length < 16) {
    return { valid: false, error: "Photo file is corrupted or too small." };
  }

  // 4. Decode buffer
  const buffer = Buffer.from(rawBase64, "base64");

  const MAX_DECODED_BYTES = 300 * 1024; // 300 KB
  if (buffer.length > MAX_DECODED_BYTES) {
    return {
      valid: false,
      error: `Photo exceeds the 300 KB limit (actual: ${Math.round(buffer.length / 1024)} KB). Please choose a smaller image.`
    };
  }

  if (buffer.length < 12) {
    return { valid: false, error: "Photo file is corrupted or too small." };
  }

  let matches = false;
  if (declaredMime === "image/jpeg" || declaredMime === "image/jpg") {
    // JPEG magic bytes: 0xFF, 0xD8, 0xFF
    matches = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  } else if (declaredMime === "image/png") {
    // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    matches = (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    );
  } else if (declaredMime === "image/webp") {
    // WebP magic bytes: bytes 0-3 'RIFF' and bytes 8-11 'WEBP'
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    matches = isRiff && isWebp;
  }

  if (!matches) {
    return {
      valid: false,
      error: "Image content does not match the declared file type. Only authentic JPEG, PNG, or WebP images are allowed."
    };
  }

  return { valid: true, buffer, mime: declaredMime };
}

router.validateBase64Photo = validateBase64Photo;

// -------------------------------------------------------------
// 5b. POST /profile/photo - Directly Save Profile Photo to MongoDB
// -------------------------------------------------------------
router.post("/profile/photo", requireLogin, actionLimiter, async (req, res) => {
  try {
    const { photo, profilePic, avatar } = req.body;
    const picData = (photo || profilePic || avatar || "").trim();
    if (!picData) {
      return res.status(400).json({ success: false, error: "No photo data provided" });
    }

    const validation = validateBase64Photo(picData);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const user = req.user;
    user.profilePic = picData;
    user.avatar = picData;
    user.photo = picData;
    user.lastActive = new Date();
    await user.save();

    console.log(`[Photo] Profile photo updated directly in MongoDB for user: ${user._id}`);
    return res.json({
      success: true,
      message: "Photo saved to database successfully",
      profilePic: user.profilePic
    });
  } catch (err) {
    console.error("Error saving photo:", err.message);
    return res.status(500).json({ success: false, error: "Failed to save photo: " + err.message });
  }
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
      phone,
      github,
      linkedin,
      portfolio,
      availability,
      isProfileHidden,
      emailNotifications,
      skills,
      projectsRaw,
      pastHackathonsRaw,
      profilePic
    } = req.body;

    // Validate and normalize Indian mobile phone number (optional)
    if (phone !== undefined) {
      const rawPhone = String(phone).trim();
      if (rawPhone === "") {
        user.phone = "";
      } else {
        if (!/^[+]?[0-9 -]+$/.test(rawPhone)) {
          const errMsg = "Invalid phone number: only digits, spaces, hyphens, and +91 or 0 prefix are allowed.";
          req.session.error = errMsg;
          if (req.xhr || req.headers.accept?.includes("application/json")) {
            return res.status(400).json({ error: errMsg });
          }
          return res.status(400).render("profile-edit", {
            currentUser: { ...(req.user.toObject ? req.user.toObject() : req.user), ...req.body },
            error: errMsg
          });
        }
        let digits = rawPhone.replace(/[ -]+/g, "");
        if (digits.startsWith("+91")) {
          digits = digits.slice(3);
        } else if (digits.startsWith("+")) {
          const errMsg = "Invalid phone number: only Indian mobile numbers (+91 prefix) are supported.";
          req.session.error = errMsg;
          if (req.xhr || req.headers.accept?.includes("application/json")) {
            return res.status(400).json({ error: errMsg });
          }
          return res.status(400).render("profile-edit", {
            currentUser: { ...(req.user.toObject ? req.user.toObject() : req.user), ...req.body },
            error: errMsg
          });
        } else if (digits.startsWith("0")) {
          digits = digits.slice(1);
        } else if (digits.startsWith("91") && digits.length === 12) {
          digits = digits.slice(2);
        }

        if (!/^[6-9][0-9]{9}$/.test(digits)) {
          const errMsg = "Invalid phone number: must be a valid 10-digit Indian mobile number.";
          req.session.error = errMsg;
          if (req.xhr || req.headers.accept?.includes("application/json")) {
            return res.status(400).json({ error: errMsg });
          }
          return res.status(400).render("profile-edit", {
            currentUser: { ...(req.user.toObject ? req.user.toObject() : req.user), ...req.body },
            error: errMsg
          });
        }
        user.phone = digits;
      }
    }

    if (name && name.trim()) user.name = name.trim();
    if (profilePic !== undefined) {
      const pic = profilePic.trim();
      user.profilePic = pic;
      user.avatar = pic;
      user.photo = pic;
    }
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
    if (linkedin !== undefined) {
      let cleanLi = linkedin.trim();
      if (cleanLi && !cleanLi.startsWith("http://") && !cleanLi.startsWith("https://")) {
        if (cleanLi.includes("linkedin.com/in/")) {
          cleanLi = "https://" + cleanLi.replace(/^\/+/, "");
        } else if (!cleanLi.includes("linkedin.com")) {
          cleanLi = `https://www.linkedin.com/in/${cleanLi.replace(/^@/, "")}`;
        }
      }
      user.linkedin = cleanLi;
    }
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
