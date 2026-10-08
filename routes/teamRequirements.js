const express = require('express');
const router = express.Router();
const TeamRequirement = require('../models/TeamRequirement');
const User = require('../models/User');
const { getRecommendedCandidates } = require('../utils/recommendations');
const requireLogin = require('../middleware/auth');

// 1. Context Step (Protected)
router.get("/new", requireLogin, (req, res) => {
  res.render("team-requirement/context", { teamData: {} });
});

router.post("/new", requireLogin, (req, res) => {
  res.render("team-requirement/context", { teamData: req.body || {} });
});

// 2. Define Team Step (Protected)
router.get("/new/define-team", requireLogin, (req, res) => {
  res.redirect("/team-requirement/new");
});

router.post("/new/define-team", requireLogin, (req, res) => {
  const teamData = {
    theme: req.body.theme || 'hackathon',
    projectName: req.body.projectName || '',
    projectRequirement: req.body.projectRequirement || '',
    deliverables: req.body.deliverables || '',
    teamSize: req.body.teamSize || 4,
    deadline: req.body.deadline || '',
    rolesJson: req.body.rolesJson || ''
  };
  res.render("team-requirement/define-team", { teamData });
});

// 3. Open Roles Step (Protected)
router.get("/new/open-roles", requireLogin, (req, res) => {
  res.redirect("/team-requirement/new");
});

router.post("/new/open-roles", requireLogin, (req, res) => {
  let parsedRoles = [];
  if (req.body.rolesJson) {
    try {
      parsedRoles = typeof req.body.rolesJson === 'string' ? JSON.parse(req.body.rolesJson) : req.body.rolesJson;
    } catch (err) {
      console.error("Failed to parse rolesJson in open-roles:", err);
    }
  }

  res.render("team-requirement/open-roles", {
    teamData: req.body || {},
    roles: parsedRoles
  });
});

// 4. Review Step (Protected)
router.get("/new/review", requireLogin, (req, res) => {
  res.redirect("/team-requirement/new");
});

router.post("/new/review", requireLogin, (req, res) => {
  let parsedRoles = [];
  if (req.body.rolesJson) {
    try {
      parsedRoles = typeof req.body.rolesJson === 'string' ? JSON.parse(req.body.rolesJson) : req.body.rolesJson;
    } catch (err) {
      console.error("Failed to parse roles JSON in review:", err);
    }
  }

  res.render("team-requirement/review", {
    teamData: req.body || {},
    roles: parsedRoles
  });
});

// 5. Final Submission (Protected)
router.post("/submit", requireLogin, async (req, res, next) => {
  try {
    let parsedRoles = [];
    if (req.body.rolesJson) {
      parsedRoles = typeof req.body.rolesJson === 'string' ? JSON.parse(req.body.rolesJson) : req.body.rolesJson;
    }

    const { theme, projectName, projectRequirement, deliverables, teamSize, deadline } = req.body;

    // Validate main required fields
    if (!theme || !projectName || !projectRequirement || !deliverables || !teamSize || !deadline) {
      return res.status(400).send("Validation Error: Please fill in all required team details.");
    }

    // Validate roles
    if (!parsedRoles || parsedRoles.length === 0) {
      return res.status(400).send("Validation Error: At least one role is required.");
    }

    const requirementData = {
      createdBy: req.user._id,
      theme,
      projectName,
      projectRequirement,
      deliverables,
      teamSize: Number(teamSize),
      deadline: new Date(deadline),
      roles: parsedRoles
    };

    const teamRequirement = new TeamRequirement(requirementData);
    await teamRequirement.save();

    console.log("MongoDB document created successfully:", teamRequirement._id, "by user:", req.user.email);
    res.redirect("/?teamId=" + teamRequirement._id);
  } catch (err) {
    console.error("Database or Validation Error:", err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).send(`Validation Error: ${err.message}`);
    }
    res.status(500).send(`Error saving team requirement: ${err.message}. Please check if local MongoDB is running.`);
  }
});

// 6. Get Recommended Candidates for a Team Requirement
router.get("/:id/recommendations", async (req, res) => {
  try {
    const team = await TeamRequirement.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team requirement not found" });
    }

    const roleIndex = parseInt(req.query.roleIndex, 10) || 0;
    const role = (team.roles && team.roles[roleIndex]) ? team.roles[roleIndex] : (team.roles ? team.roles[0] : null);

    if (!role) {
      return res.json({ team, role: null, recommendations: [] });
    }

    const currentUserId = req.user ? req.user._id : null;
    const recommendations = await getRecommendedCandidates(team, role, currentUserId);

    res.json({
      success: true,
      teamId: team._id,
      projectName: team.projectName,
      role: role.title,
      recommendations
    });
  } catch (err) {
    console.error("Error fetching recommendations:", err.message);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

module.exports = router;
