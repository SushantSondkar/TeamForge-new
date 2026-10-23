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

    console.log(`Unified Action created: APPLY action ID ${action._id} for team requirement ${team._id}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        message: "Application submitted successfully",
        actionId: action._id,
        status: action.status
      });
    }

    req.session.success = "Application submitted successfully!";
    res.redirect("/discover?success=" + encodeURIComponent("Application submitted successfully!"));
  } catch (err) {
    console.error("Error creating application:", err.message);
    req.session.error = err.message;
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------
// 2. GET /applications - Root applications router, redirects to user's team applications
// -----------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const team = await TeamRequirement.findOne({ createdBy: req.user._id }).sort({ createdAt: -1 });
    if (team) {
      return res.redirect(`/applications/team/${team._id}`);
    }
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error resolving applications route:", err.message);
    res.redirect("/dashboard");
  }
});

// -----------------------------------------------------------------
// 2b. GET /applications/team/:teamId - View applications received for team
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
      .populate("senderId", "name email department role skills credibility github linkedin portfolio profilePic avatar photo")
      .populate("receiverId", "name email department role skills credibility github linkedin portfolio profilePic avatar photo")
      .sort({ createdAt: -1 });

    // Map to normalized structure for view compatibility
    const applications = actions.map(act => {
      const isIncoming = act.direction === "APPLY";
      const isOutgoing = act.direction === "INVITE";
      const rawApplicant = isIncoming ? act.senderId : act.receiverId;
      const bothOptedIn = Boolean(act.senderContactOptIn && act.receiverContactOptIn);
      let applicant = rawApplicant;
      if (rawApplicant && !bothOptedIn) {
        applicant = {
          _id: rawApplicant._id,
          name: rawApplicant.name,
          department: rawApplicant.department,
          role: rawApplicant.role,
          skills: rawApplicant.skills,
          credibility: rawApplicant.credibility,
          profilePic: rawApplicant.profilePic || rawApplicant.avatar || rawApplicant.photo || ""
        };
      }
      return {
        _id: act._id,
        applicantId: applicant,
        role: act.role,
        status: act.status,
        direction: act.direction,
        isIncoming,
        isOutgoing,
        canAccept: isIncoming && act.status === "PENDING",
        canConfirm: isOutgoing && act.status === "ACCEPTED",
        canDecline: act.status === "PENDING",
        confirmedByRequester: act.confirmedByRequester,
        confirmationExpiresAt: act.confirmationExpiresAt,
        bothOptedIn,
        myContactOptIn: act.receiverId && act.receiverId._id && act.receiverId._id.equals(req.user._id) ? act.receiverContactOptIn : act.senderContactOptIn,
        createdAt: act.createdAt
      };
    });

    const receivedApplications = applications.filter(a => a.isIncoming);
    const sentInvitations = applications.filter(a => a.isOutgoing);

    res.render("applications/team", {
      team,
      applications,
      receivedApplications,
      sentInvitations
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
  let action;
  try {
    // Find unified action
    action = await TeamRequestAction.findById(req.params.id);
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
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ error: "Application action not found." });
      }
      return res.redirect("/dashboard?error=" + encodeURIComponent("Application action not found."));
    }

    // Direction Guard: If this is an INVITE sent by the current user
    if (action.direction === "INVITE" && action.senderId.equals(req.user._id)) {
      if (action.status === "ACCEPTED") {
        // Candidate has accepted; confirming locks the match
        await confirmAction(action._id, req.user._id);
        const msg = "Candidate confirmed and locked into the team!";
        if (req.xhr || req.headers.accept?.includes("application/json")) {
          return res.json({ success: true, status: "LOCKED", message: msg });
        }
        req.session.success = msg;
        return res.redirect(`/applications/team/${action.teamRequirementId}?success=` + encodeURIComponent(msg));
      } else {
        const msg = "This is an outgoing invitation waiting for the candidate to accept.";
        if (req.xhr || req.headers.accept?.includes("application/json")) {
          return res.status(400).json({ error: msg });
        }
        req.session.error = msg;
        return res.redirect(`/applications/team/${action.teamRequirementId}?error=` + encodeURIComponent(msg));
      }
    }

    const updated = await acceptAction(action._id, req.user._id);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: updated.status, message: "Accepted. Waiting for applicant to confirm." });
    }

    req.session.success = "Application accepted! Waiting for applicant to confirm.";
    res.redirect(`/applications/team/${action.teamRequirementId}?success=` + encodeURIComponent("Application accepted! Waiting for applicant to confirm."));
  } catch (err) {
    console.error("Error accepting application:", err.message);
    req.session.error = err.message;
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/dashboard";
    res.redirect(`${redirectUrl}?error=` + encodeURIComponent(err.message));
  }
});

// -----------------------------------------------------------------
// 4. POST /applications/:id/confirm - Requester confirms accepted spot -> LOCKED
// -----------------------------------------------------------------
router.post("/:id/confirm", requireLogin, async (req, res) => {
  let action;
  try {
    action = await TeamRequestAction.findById(req.params.id);
    const updated = await confirmAction(req.params.id, req.user._id);

    const msg = "Spot confirmed and locked for this event!";
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: "LOCKED", message: msg });
    }

    req.session.success = msg;
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/notifications";
    res.redirect(`${redirectUrl}?success=` + encodeURIComponent(msg));
  } catch (err) {
    console.error("Error confirming spot:", err.message);
    req.session.error = err.message;
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/notifications";
    res.redirect(`${redirectUrl}?error=` + encodeURIComponent(err.message));
  }
});

// -----------------------------------------------------------------
// 5. POST /applications/:id/reject or decline
// -----------------------------------------------------------------
router.post("/:id/reject", requireLogin, async (req, res) => {
  let action;
  try {
    action = await TeamRequestAction.findById(req.params.id);
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
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ error: "Application action not found." });
      }
      return res.redirect("/dashboard?error=" + encodeURIComponent("Application action not found."));
    }

    const updated = await declineAction(action._id, req.user._id);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: updated.status });
    }

    const msg = action.direction === "INVITE" ? "Invitation cancelled." : "Application declined.";
    req.session.success = msg;
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/dashboard";
    res.redirect(`${redirectUrl}?success=` + encodeURIComponent(msg));
  } catch (err) {
    console.error("Error declining action:", err.message);
    req.session.error = err.message;
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/dashboard";
    res.redirect(`${redirectUrl}?error=` + encodeURIComponent(err.message));
  }
});

// -----------------------------------------------------------------
// 6. POST /applications/:id/contact-consent - Mutual Contact Opt-in
// -----------------------------------------------------------------
router.post("/:id/contact-consent", requireLogin, async (req, res) => {
  let action;
  try {
    action = await TeamRequestAction.findById(req.params.id);
    const updated = await optInContactSharing(req.params.id, req.user._id);
    const bothOptedIn = Boolean(updated.senderContactOptIn && updated.receiverContactOptIn);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        bothOptedIn,
        message: bothOptedIn ? "Mutual contact sharing unlocked!" : "Opt-in recorded. Waiting for teammate."
      });
    }

    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/dashboard";
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Error updating contact consent:", err.message);
    req.session.error = err.message;
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    const redirectUrl = action?.teamRequirementId ? `/applications/team/${action.teamRequirementId}` : "/dashboard";
    res.redirect(`${redirectUrl}?error=` + encodeURIComponent(err.message));
  }
});

module.exports = router;
