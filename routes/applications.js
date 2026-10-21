const express = require("express");
const router = express.Router();
const User = require("../models/User");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const Application = require("../models/Application");
const requireLogin = require("../middleware/auth");
const { actionLimiter } = require("../middleware/rateLimiters");
const {
  createAction,
  acceptAction,
  confirmAction,
  declineAction,
  optInContactSharing
} = require("../utils/actionStateMachine");

// -----------------------------------------------------------------
// 1. POST /applications/apply - Candidate applies to a team role (Direction: APPLY)
// -----------------------------------------------------------------
router.post("/apply", requireLogin, actionLimiter, async (req, res) => {
  try {
    const currentUser = req.user;
    const { teamRequirementId, role } = req.body;

    if (!teamRequirementId || !role) {
      return res.status(400).json({ error: "Missing teamRequirementId or role." });
    }

    const team = await TeamRequirement.findById(teamRequirementId);
    if (!team) {
      return res.status(404).json({ error: "Team requirement not found." });
    }

    if (team.createdBy && team.createdBy.equals(currentUser._id)) {
      return res.status(400).json({ error: "You cannot apply to your own team." });
    }

    const roleObj = (team.roles || []).find(r => r.title.toLowerCase().trim() === role.toLowerCase().trim());
    if (!roleObj) {
      return res.status(404).json({ error: "Role not found in this team requirement." });
    }

    if (roleObj.openings <= 0) {
      return res.status(400).json({ error: "This role has no openings remaining (Role Filled)." });
    }

    const action = await createAction({
      senderId: currentUser._id,
      receiverId: team.createdBy,
      teamRequirementId: team._id,
      role: roleObj.title,
      direction: "APPLY"
    });

    console.log(`Unified Action created: APPLY from ${currentUser.name} to team ${team.projectName} for role ${roleObj.title}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        message: "Application submitted successfully",
        actionId: action._id,
        status: action.status
      });
    }

    res.redirect("/discover");
  } catch (err) {
    console.error("Error creating application:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------
// 2. GET /applications/team/:teamId - View applications received for team
// -----------------------------------------------------------------
router.get("/team/:teamId", requireLogin, async (req, res) => {
  try {
    const team = await TeamRequirement.findById(req.params.teamId);
    if (!team) {
      return res.status(404).send("Team requirement not found.");
    }

    if (team.createdBy && !team.createdBy.equals(req.user._id)) {
      return res.status(403).send("Unauthorized: Only the team owner can view received applications.");
    }

    // Retrieve actions submitted to this team (APPLY or INVITE)
    const actions = await TeamRequestAction.find({ teamRequirementId: team._id })
      .populate("senderId", "name email department role skills credibility github linkedin portfolio")
      .populate("receiverId", "name email department role skills credibility github linkedin portfolio")
      .sort({ createdAt: -1 });

    // Map to normalized structure for view compatibility
    const applications = actions.map(act => {
      const rawApplicant = act.direction === "APPLY" ? act.senderId : act.receiverId;
      const bothOptedIn = act.senderContactOptIn && act.receiverContactOptIn;
      let applicant = rawApplicant;
      if (rawApplicant && !bothOptedIn) {
        applicant = {
          _id: rawApplicant._id,
          name: rawApplicant.name,
          department: rawApplicant.department,
          role: rawApplicant.role,
          skills: rawApplicant.skills,
          credibility: rawApplicant.credibility
        };
      }
      return {
        _id: act._id,
        applicantId: applicant,
        role: act.role,
        status: act.status,
        direction: act.direction,
        confirmedByRequester: act.confirmedByRequester,
        confirmationExpiresAt: act.confirmationExpiresAt,
        bothOptedIn,
        myContactOptIn: act.receiverId._id.equals(req.user._id) ? act.receiverContactOptIn : act.senderContactOptIn,
        createdAt: act.createdAt
      };
    });

    res.render("applications/team", {
      team,
      applications
    });
  } catch (err) {
    console.error("Error fetching team applications:", err.message);
    res.status(500).send("Error loading team applications.");
  }
});

// -----------------------------------------------------------------
// 3. POST /applications/:id/accept - Lead accepts application
// NOTE: Accepting never locks! Requester subsequently confirms.
// -----------------------------------------------------------------
router.post("/:id/accept", requireLogin, async (req, res) => {
  try {
    // Find unified action
    let action = await TeamRequestAction.findById(req.params.id);
    if (!action) {
      // Check legacy application
      const legacyApp = await Application.findById(req.params.id);
      if (legacyApp) {
        action = await TeamRequestAction.findOne({
          senderId: legacyApp.applicantId,
          teamRequirementId: legacyApp.teamRequirementId,
          role: legacyApp.role
        });
      }
    }

    if (!action) {
      return res.status(404).send("Application action not found.");
    }

    const updated = await acceptAction(action._id, req.user._id);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: updated.status, message: "Accepted. Waiting for applicant to confirm." });
    }

    res.redirect(`/applications/team/${action.teamRequirementId}`);
  } catch (err) {
    console.error("Error accepting application:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 4. POST /applications/:id/confirm - Applicant confirms accepted spot -> LOCKED
// -----------------------------------------------------------------
router.post("/:id/confirm", requireLogin, async (req, res) => {
  try {
    const action = await confirmAction(req.params.id, req.user._id);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: "LOCKED", message: "Spot confirmed and locked for this event!" });
    }

    res.redirect("/notifications");
  } catch (err) {
    console.error("Error confirming spot:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 5. POST /applications/:id/reject or decline
// -----------------------------------------------------------------
router.post("/:id/reject", requireLogin, async (req, res) => {
  try {
    let action = await TeamRequestAction.findById(req.params.id);
    if (!action) {
      const legacyApp = await Application.findById(req.params.id);
      if (legacyApp) {
        action = await TeamRequestAction.findOne({
          senderId: legacyApp.applicantId,
          teamRequirementId: legacyApp.teamRequirementId,
          role: legacyApp.role
        });
      }
    }

    if (!action) {
      return res.status(404).send("Application action not found.");
    }

    const updated = await declineAction(action._id, req.user._id);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: updated.status });
    }

    res.redirect(`/applications/team/${action.teamRequirementId}`);
  } catch (err) {
    console.error("Error declining application:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 6. POST /applications/:id/contact-consent - Mutual Contact Opt-in
// -----------------------------------------------------------------
router.post("/:id/contact-consent", requireLogin, async (req, res) => {
  try {
    const action = await optInContactSharing(req.params.id, req.user._id);
    const bothOptedIn = action.senderContactOptIn && action.receiverContactOptIn;

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        bothOptedIn,
        message: bothOptedIn ? "Mutual contact sharing unlocked!" : "Opt-in recorded. Waiting for teammate."
      });
    }

    res.redirect(`/applications/team/${action.teamRequirementId}`);
  } catch (err) {
    console.error("Error updating contact consent:", err.message);
    res.status(400).send(err.message);
  }
});

module.exports = router;
