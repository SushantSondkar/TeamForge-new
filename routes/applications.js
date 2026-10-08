const express = require("express");
const router = express.Router();
const User = require("../models/User");
const TeamRequirement = require("../models/TeamRequirement");
const Application = require("../models/Application");
const requireLogin = require("../middleware/auth");

// -----------------------------------------------------------------
// 1. POST /applications/apply - Candidate applies to a team role
// -----------------------------------------------------------------
router.post("/apply", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    const { teamRequirementId, role } = req.body;

    if (!teamRequirementId || !role) {
      return res.status(400).json({ error: "Missing teamRequirementId or role." });
    }

    // 1. Verify Team Requirement exists
    const team = await TeamRequirement.findById(teamRequirementId);
    if (!team) {
      return res.status(404).json({ error: "Team requirement not found." });
    }

    // Prevent team creator from applying to their own team
    if (team.createdBy && team.createdBy.equals(currentUser._id)) {
      return res.status(400).json({ error: "You cannot apply to your own team." });
    }

    // 2. Find the requested role in team
    const roleObj = (team.roles || []).find(r => r.title.toLowerCase().trim() === role.toLowerCase().trim());
    if (!roleObj) {
      return res.status(404).json({ error: "Role not found in this team requirement." });
    }

    // 3. Check openings: Cannot apply if openings <= 0
    if (roleObj.openings <= 0) {
      return res.status(400).json({ error: "This role has no openings remaining." });
    }

    // 4. Check required skills
    const userSkillsMap = {};
    if (Array.isArray(currentUser.skills)) {
      currentUser.skills.forEach(s => {
        if (s && s.name) {
          userSkillsMap[s.name.toLowerCase().trim()] = s.level || 1;
        }
      });
    }

    const requiredSkills = roleObj.requiredSkills || [];
    for (const reqSkill of requiredSkills) {
      const level = userSkillsMap[reqSkill.toLowerCase().trim()];
      if (!level || level <= 0) {
        return res.status(400).json({ error: `You lack the required skill: ${reqSkill}` });
      }
    }

    // 5. Prevent duplicate applications
    const existingApplication = await Application.findOne({
      applicantId: currentUser._id,
      teamRequirementId: team._id,
      role: roleObj.title
    });

    if (existingApplication) {
      return res.status(400).json({ error: "You have already applied for this role." });
    }

    // 6. Create application with default status: UNDER_REVIEW
    const newApplication = new Application({
      applicantId: currentUser._id,
      teamRequirementId: team._id,
      role: roleObj.title,
      status: "UNDER_REVIEW"
    });

    await newApplication.save();
    console.log(`Application created: ${currentUser.name} applied for ${roleObj.title} at ${team.projectName}`);

    // If client requested JSON via AJAX fetch
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        message: "Application submitted successfully",
        applicationId: newApplication._id,
        status: "UNDER_REVIEW"
      });
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error creating application:", err.message);
    res.status(500).json({ error: `Server error creating application: ${err.message}` });
  }
});

// -------------------------------------------------------------
// 2. GET /applications/team/:teamRequirementId - Team owner views applications
// -------------------------------------------------------------
router.get("/team/:teamRequirementId", requireLogin, async (req, res) => {
  try {
    const team = await TeamRequirement.findById(req.params.teamRequirementId);
    if (!team) {
      return res.status(404).send("Team requirement not found.");
    }

    // Authorization: Only the creator of the team can view candidates' applications
    if (team.createdBy && !team.createdBy.equals(req.user._id)) {
      return res.status(403).send("Unauthorized: Only the creator of this team can review applications.");
    }

    const applications = await Application.find({ teamRequirementId: team._id })
      .populate("applicantId")
      .sort({ createdAt: -1 });

    res.render("applications/team", {
      team,
      applications
    });
  } catch (err) {
    console.error("Error fetching team applications:", err.message);
    res.status(500).send("Error loading team applications.");
  }
});

// -------------------------------------------------------------
// Helper to update application status and handle openings reduction
// -------------------------------------------------------------
async function updateApplicationStatus(applicationId, newStatus, req, res) {
  const application = await Application.findById(applicationId);
  if (!application) {
    return res.status(404).send("Application not found.");
  }

  const team = await TeamRequirement.findById(application.teamRequirementId);
  if (!team) {
    return res.status(404).send("Associated team not found.");
  }

  // Authorization: Only team owner can update status
  if (team.createdBy && !team.createdBy.equals(req.user._id)) {
    return res.status(403).send("Unauthorized: Only the team owner can update application status.");
  }

  const validStatuses = ["UNDER_REVIEW", "INTERVIEWING", "ACCEPTED", "REJECTED"];
  if (!validStatuses.includes(newStatus)) {
    return res.status(400).send("Invalid status.");
  }

  const previousStatus = application.status;
  application.status = newStatus;
  await application.save();

  // If application was just ACCEPTED, decrement role opening
  if (newStatus === "ACCEPTED" && previousStatus !== "ACCEPTED") {
    if (Array.isArray(team.roles)) {
      const roleObj = team.roles.find(r => r.title.toLowerCase().trim() === application.role.toLowerCase().trim());
      if (roleObj && roleObj.openings > 0) {
        roleObj.openings -= 1;
        await team.save();
        console.log(`Decreased openings for role ${roleObj.title} in ${team.projectName}. Remaining: ${roleObj.openings}`);
      }
    }

    // Lock candidate into this event
    const applicant = await User.findById(application.applicantId);
    if (applicant && team && team.projectName) {
      if (!applicant.lockedEvents.includes(team.projectName)) {
        applicant.lockedEvents.push(team.projectName);
        await applicant.save();
      }
    }
  }

  console.log(`Application ${application._id} updated to ${newStatus} by ${req.user.name}`);

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({ success: true, status: application.status });
  }

  res.redirect(`/applications/team/${application.teamRequirementId}`);
}

// -------------------------------------------------------------
// 3. Status Action Routes (Protected)
// -------------------------------------------------------------
router.post("/:id/status", requireLogin, async (req, res) => {
  try {
    const { status } = req.body;
    await updateApplicationStatus(req.params.id, status, req, res);
  } catch (err) {
    console.error("Error updating status:", err.message);
    res.status(500).send("Error updating application status.");
  }
});

router.post("/:id/interview", requireLogin, async (req, res) => {
  try {
    await updateApplicationStatus(req.params.id, "INTERVIEWING", req, res);
  } catch (err) {
    console.error("Error moving to interview:", err.message);
    res.status(500).send("Error updating status.");
  }
});

router.post("/:id/accept", requireLogin, async (req, res) => {
  try {
    await updateApplicationStatus(req.params.id, "ACCEPTED", req, res);
  } catch (err) {
    console.error("Error accepting application:", err.message);
    res.status(500).send("Error updating status.");
  }
});

router.post("/:id/reject", requireLogin, async (req, res) => {
  try {
    await updateApplicationStatus(req.params.id, "REJECTED", req, res);
  } catch (err) {
    console.error("Error rejecting application:", err.message);
    res.status(500).send("Error updating status.");
  }
});

module.exports = router;
