const express = require('express');
const router = express.Router();
const TeamRequirement = require('../models/TeamRequirement');
const Event = require('../models/Event');
const User = require('../models/User');
const { getRecommendedCandidates } = require('../utils/recommendations');
const requireLogin = require('../middleware/auth');

// 1. Context Step (Protected)
router.get("/new", requireLogin, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    const selectedEventId = req.query.eventId || '';

    // If an event was targeted, verify caller isn't already locked into it
    if (selectedEventId && req.user.lockedEvents && req.user.lockedEvents.includes(selectedEventId)) {
      return res.redirect(`/events/${selectedEventId}?error=locked`);
    }

    res.render("team-requirement/context", {
      teamData: { eventId: selectedEventId },
      events,
      selectedEventId
    });
  } catch (err) {
    console.error("Error loading new team context:", err);
    res.redirect("/events");
  }
});

router.post("/new", requireLogin, async (req, res) => {
  const events = await Event.find().sort({ date: 1 });
  res.render("team-requirement/context", {
    teamData: req.body || {},
    events,
    selectedEventId: req.body.eventId || ''
  });
});

// 2. Define Team Step (Protected)
router.get("/new/define-team", requireLogin, (req, res) => {
  res.redirect("/team-requirement/new");
});

router.post("/new/define-team", requireLogin, async (req, res) => {
  let event = null;
  if (req.body.eventId) {
    event = await Event.findById(req.body.eventId);
  }

  const teamData = {
    eventId: req.body.eventId || '',
    eventName: event ? event.name : '',
    theme: req.body.theme || 'hackathon',
    projectName: req.body.projectName || '',
    projectRequirement: req.body.projectRequirement || '',
    deliverables: req.body.deliverables || '',
    teamSize: req.body.teamSize || 4,
    deadline: req.body.deadline || (event && event.deadline ? event.deadline.toISOString().slice(0, 10) : ''),
    rolesJson: req.body.rolesJson || '',
    existingMembersJson: req.body.existingMembersJson || '[]'
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

router.post("/new/review", requireLogin, async (req, res) => {
  let parsedRoles = [];
  if (req.body.rolesJson) {
    try {
      parsedRoles = typeof req.body.rolesJson === 'string' ? JSON.parse(req.body.rolesJson) : req.body.rolesJson;
    } catch (err) {
      console.error("Failed to parse roles JSON in review:", err);
    }
  }

  let event = null;
  if (req.body.eventId) {
    event = await Event.findById(req.body.eventId);
  }

  let parsedExistingMembers = [];
  if (req.body.existingMembersJson) {
    try {
      parsedExistingMembers = typeof req.body.existingMembersJson === 'string' ? JSON.parse(req.body.existingMembersJson) : req.body.existingMembersJson;
      if (!Array.isArray(parsedExistingMembers)) parsedExistingMembers = [];
    } catch (err) {
      console.warn("Failed to parse existingMembersJson in review:", err.message);
    }
  }

  res.render("team-requirement/review", {
    teamData: {
      ...req.body,
      eventName: event ? event.name : ''
    },
    roles: parsedRoles,
    existingMembers: parsedExistingMembers
  });
});

// 5. Final Submission (Protected)
router.post("/submit", requireLogin, async (req, res, next) => {
  try {
    let parsedRoles = [];
    if (req.body.rolesJson) {
      parsedRoles = typeof req.body.rolesJson === 'string' ? JSON.parse(req.body.rolesJson) : req.body.rolesJson;
    }

    let parsedExistingMembers = [];
    if (req.body.existingMembersJson) {
      try {
        parsedExistingMembers = typeof req.body.existingMembersJson === 'string' ? JSON.parse(req.body.existingMembersJson) : req.body.existingMembersJson;
        if (!Array.isArray(parsedExistingMembers)) parsedExistingMembers = [];
      } catch (err) {
        console.warn("Failed to parse existingMembersJson in submit:", err.message);
      }
    }

    const { eventId, theme, projectName, projectRequirement, deliverables, teamSize, deadline } = req.body;

    // Optional event validation
    let event = null;
    if (eventId) {
      event = await Event.findById(eventId);
      if (!event) {
        return res.status(400).send("Validation Error: Selected event does not exist.");
      }

      // Check if user is already locked into this event
      if (req.user.lockedEvents && req.user.lockedEvents.includes(event._id.toString())) {
        return res.status(400).send("Validation Error: You are already committed to another team for this event.");
      }
    }

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
      eventId: event ? event._id : null,
      theme,
      projectName,
      projectRequirement,
      deliverables,
      teamSize: Number(teamSize),
      deadline: new Date(deadline),
      roles: parsedRoles,
      existingMembers: parsedExistingMembers
    };

    const teamRequirement = new TeamRequirement(requirementData);
    await teamRequirement.save();

    // Lock creator into this event if attached to an event
    if (event && !req.user.lockedEvents.includes(event._id.toString())) {
      req.user.lockedEvents.push(event._id.toString());
      await req.user.save();
    }

    console.log("Team requirement created successfully:", teamRequirement._id, event ? ("for event: " + event.name) : "without specific event", "by:", req.user.email);
    res.redirect("/?teamId=" + teamRequirement._id);
  } catch (err) {
    console.error("Database or Validation Error:", err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).send(`Validation Error: ${err.message}`);
    }
    res.status(500).send(`Error saving team requirement: ${err.message}.`);
  }
});

// 6. Get Recommended Candidates for a Team Requirement (Owner Only)
router.get("/:id/recommendations", requireLogin, async (req, res) => {
  try {
    const team = await TeamRequirement.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team requirement not found" });
    }

    // Verify caller is the creator / owner of this team requirement
    if (!team.createdBy || !team.createdBy.equals(req.user._id)) {
      return res.status(403).json({ error: "Forbidden: Only the team creator can view candidate recommendations." });
    }

    const roleIndex = parseInt(req.query.roleIndex, 10) || 0;
    const role = (team.roles && team.roles[roleIndex]) ? team.roles[roleIndex] : (team.roles ? team.roles[0] : null);

    if (!role) {
      return res.json({ team, role: null, recommendations: [] });
    }

    const recommendations = await getRecommendedCandidates(team, role, req.user._id);

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
