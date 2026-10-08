const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Invite = require('../models/Invite');
const TeamRequirement = require('../models/TeamRequirement');
const Application = require('../models/Application');
const { getRecommendedCandidates, getRecommendedOpportunities } = require('../utils/recommendations');
const requireLogin = require('../middleware/auth');

// -------------------------------------------------------------
// 1. GET / - Dashboard (Protected)
// -------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;

    // 1. Get the active team requirement owned by this user
    let latestTeam = null;
    if (req.query.teamId) {
      latestTeam = await TeamRequirement.findById(req.query.teamId);
      // Ensure the team belongs to this user or handle legacy team ownership
      if (latestTeam && latestTeam.createdBy && !latestTeam.createdBy.equals(currentUser._id)) {
        latestTeam = null;
      }
    }

    if (!latestTeam) {
      // Find latest team created by the current user
      latestTeam = await TeamRequirement.findOne({ createdBy: currentUser._id }).sort({ createdAt: -1 });
    }

    // Backward compatibility: If Aaradhya has legacy Alpha_coders without createdBy, link it
    if (!latestTeam && (currentUser.name === "Aaradhya Wabale" || currentUser.email === "aaradhya@test.com")) {
      latestTeam = await TeamRequirement.findOne({ projectName: "Alpha_coders" });
      if (latestTeam && !latestTeam.createdBy) {
        latestTeam.createdBy = currentUser._id;
        await latestTeam.save();
      }
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

    // 4. Retrieve applications submitted by the logged-in user
    const myApplications = await Application.find({ applicantId: currentUser._id })
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    // 5. Count applications received for the active team requirement
    let teamApplicationCount = 0;
    if (latestTeam) {
      teamApplicationCount = await Application.countDocuments({ teamRequirementId: latestTeam._id });
    }

    // 6. Retrieve invites sent by this coordinator/user
    const sentInvites = await Invite.find({ senderId: currentUser._id })
      .populate("receiverId")
      .sort({ createdAt: -1 });

    // 7. Retrieve pending invites received by this user
    const receivedInvites = await Invite.find({ receiverId: currentUser._id, status: "PENDING" })
      .populate("senderId")
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    res.render("home", {
      latestTeam,
      recommendedCandidates,
      recommendedOpportunities,
      myApplications,
      teamApplicationCount,
      sentInvites,
      receivedInvites,
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
      currentUser: req.user || null
    });
  }
});

// -------------------------------------------------------------
// 2. GET /discover - Explore Opportunities (Public / Semi-public)
// -------------------------------------------------------------
router.get("/discover", async (req, res) => {
  try {
    const teamRequirements = await TeamRequirement.find().sort({ createdAt: -1 });
    const currentUser = req.user || null;
    const recommendedOpportunities = currentUser ? await getRecommendedOpportunities(currentUser) : [];
    res.render("discover", { teamRequirements, recommendedOpportunities, currentUser });
  } catch (error) {
    console.error("Error fetching team requirements for discover:", error.message);
    res.render("discover", { teamRequirements: [], recommendedOpportunities: [], currentUser: null });
  }
});

// -------------------------------------------------------------
// 3. GET /notifications - User Notifications (Protected)
// -------------------------------------------------------------
router.get("/notifications", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    let notifications = [];

    // 1. Applications submitted by this user
    const userApps = await Application.find({ applicantId: currentUser._id })
      .populate("teamRequirementId")
      .sort({ createdAt: -1 });

    userApps.forEach(app => {
      const teamName = app.teamRequirementId ? app.teamRequirementId.projectName : "Team";
      let message = `Your application for ${app.role} at ${teamName} is under review.`;
      let type = "info";
      if (app.status === "INTERVIEWING") {
        message = `Your application for ${app.role} at ${teamName} is now in interview stage.`;
        type = "warning";
      } else if (app.status === "ACCEPTED") {
        message = `Congratulations! Your application for ${app.role} at ${teamName} was accepted!`;
        type = "success";
      } else if (app.status === "REJECTED") {
        message = `Your application for ${app.role} at ${teamName} was not selected.`;
        type = "danger";
      }
      notifications.push({
        title: message,
        subtitle: `Role: ${app.role} · ${app.status.replace('_', ' ')}`,
        time: new Date(app.createdAt).toLocaleDateString(),
        type: type
      });
    });

    // 2. Invites received by this user
    const userInvites = await Invite.find({ receiverId: currentUser._id })
      .populate("teamRequirementId")
      .populate("senderId")
      .sort({ createdAt: -1 });

    userInvites.forEach(inv => {
      const senderName = inv.senderId ? inv.senderId.name : "A team lead";
      const teamName = inv.teamRequirementId ? inv.teamRequirementId.projectName : "Team";
      notifications.push({
        title: `New invite from ${senderName} for ${teamName}`,
        subtitle: `Role: ${inv.role} · Status: ${inv.status}`,
        time: new Date(inv.createdAt).toLocaleDateString(),
        type: "invite"
      });
    });

    res.render("notifications", { notifications, currentUser });
  } catch (err) {
    console.error("Error loading notifications:", err.message);
    res.render("notifications", { notifications: [], currentUser: null });
  }
});

// -------------------------------------------------------------
// 4. GET /profile - View Current User Profile (Protected)
// -------------------------------------------------------------
router.get("/profile", requireLogin, (req, res) => {
  res.render("profile", { currentUser: req.user });
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
    const { name, role, availability, skills } = req.body;

    if (name && name.trim()) {
      user.name = name.trim();
    }
    if (role && role.trim()) {
      user.role = role.trim();
    }
    if (availability !== undefined && availability !== null) {
      if (typeof availability === 'string') {
        const lower = availability.toLowerCase();
        if (lower.includes('busy') || lower.includes('not')) {
          user.availability = 0;
        } else if (lower.includes('look') || lower.includes('part')) {
          user.availability = 0.5;
        } else if (!isNaN(parseFloat(availability))) {
          user.availability = Math.min(1, Math.max(0, parseFloat(availability)));
        } else {
          user.availability = 1.0;
        }
      } else if (typeof availability === 'number') {
        user.availability = Math.min(1, Math.max(0, availability));
      }
    }

    // Parse skills
    if (skills) {
      if (typeof skills === 'string') {
        // e.g., "React:4, Node.js:5, Python:3" or "React, Node.js, Python"
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

    await user.save();
    console.log(`Profile updated for user: ${user.email}`);
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
