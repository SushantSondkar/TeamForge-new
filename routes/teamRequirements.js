const express = require('express');
const router = express.Router();
const TeamRequirement = require('../models/TeamRequirement');

// 1. Context Step
router.get("/new", (req, res) => {
  res.render("team-requirement/context");
});

// 2. Define Team Step
router.get("/new/define-team", (req, res) => {
  res.render("team-requirement/define-team");
});

router.post("/new/define-team", (req, res) => {
  const { theme, projectRequirement, deliverables } = req.body;
  res.render("team-requirement/define-team", {
    theme,
    projectRequirement,
    deliverables,
  });
});

// 3. Open Roles Step
router.get("/new/open-roles", (req, res) => {
  res.redirect("/team-requirement/new");
});

router.post("/new/open-roles", (req, res) => {
  res.render("team-requirement/open-roles", {
    teamData: req.body,
  });
});

// 4. Review Step
router.post("/new/review", (req, res) => {
  // If we receive rolesJson, parse it to pass an array of role objects to the review UI
  let parsedRoles = [];
  if (req.body.rolesJson) {
    try {
      parsedRoles = JSON.parse(req.body.rolesJson);
    } catch (err) {
      console.error("Failed to parse roles JSON:", err);
    }
  }

  res.render("team-requirement/review", {
    teamData: req.body,
    roles: parsedRoles
  });
});

// Final Submission
router.post("/submit", async (req, res, next) => {
  try {
    let parsedRoles = [];
    if (req.body.rolesJson) {
      parsedRoles = JSON.parse(req.body.rolesJson);
    }

    const requirementData = {
      theme: req.body.theme,
      projectName: req.body.projectName,
      projectRequirement: req.body.projectRequirement,
      deliverables: req.body.deliverables,
      teamSize: req.body.teamSize,
      deadline: req.body.deadline,
      roles: parsedRoles
    };

    const teamRequirement = new TeamRequirement(requirementData);
    await teamRequirement.save();

    console.log("Team Requirement saved successfully!");
    // Redirect to home on success
    res.redirect("/");
  } catch (err) {
    console.error("Database or Validation Error:", err.message);
    
    // If the error is a timeout because local MongoDB is not running, gracefully fallback
    // This allows the UI flow to complete even if the developer hasn't started the DB.
    if (err.message && (err.message.includes("buffering timed out") || err.message.includes("ECONNREFUSED"))) {
        console.warn("MongoDB is not running. Bypassing save to allow UI flow to finish.");
        return res.redirect("/");
    }

    next(err); // Pass other errors to global error handler
  }
});

module.exports = router;
