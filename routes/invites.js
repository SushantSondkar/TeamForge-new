const express = require("express");
const router = express.Router();
const TeamRequestAction = require("../models/TeamRequestAction");
const TeamRequirement = require("../models/TeamRequirement");
const requireLogin = require("../middleware/auth");
const {
  createAction,
  acceptAction,
  confirmAction,
  declineAction,
  optInContactSharing
} = require("../utils/actionStateMachine");

// -----------------------------------------------------------------
// 1. POST /invites/send - Send a team invitation (Direction: INVITE)
// -----------------------------------------------------------------
router.post("/send", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    const { receiverId, teamRequirementId, role } = req.body;

    if (!receiverId || !teamRequirementId) {
      const errMsg = "Missing receiverId or teamRequirementId.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 1. Verify team requirement exists
    const team = await TeamRequirement.findById(teamRequirementId);
    if (!team) {
      const errMsg = "Team requirement not found.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(404).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 2. Strict Ownership Verification: Caller must be the team creator
    if (!team.createdBy || !team.createdBy.equals(currentUser._id)) {
      const errMsg = "Forbidden: You do not own this team requirement.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(403).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 3. Self-Invitation Guard
    if (currentUser._id.equals(receiverId)) {
      const errMsg = "You cannot send an invitation to yourself.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 4. Candidate Eligibility Verification
    const User = require("../models/User");
    const candidate = await User.findById(receiverId);
    if (!candidate) {
      const errMsg = "Candidate not found.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(404).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    if (candidate.isProfileHidden) {
      const errMsg = "This candidate's profile is hidden and cannot receive invitations.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    const eventLockKey = team.eventId ? team.eventId.toString() : team.projectName;
    if (eventLockKey && candidate.lockedEvents && candidate.lockedEvents.includes(eventLockKey)) {
      const errMsg = "Candidate is already committed to a team for this event.";
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 5. Role Validation & Capacity Check
    const assignedRole = role || (team.roles && team.roles[0] ? team.roles[0].title : "Collaborator");
    const roleObj = (team.roles || []).find(r => r.title.toLowerCase().trim() === assignedRole.toLowerCase().trim());
    if (roleObj && roleObj.openings <= 0) {
      const errMsg = `The role '${assignedRole}' has no openings remaining.`;
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.redirect("/?error=" + encodeURIComponent(errMsg));
    }

    // 6. Create Action via Unified State Machine
    const action = await createAction({
      senderId: currentUser._id,
      receiverId,
      teamRequirementId,
      role: assignedRole,
      direction: "INVITE"
    });

    console.log(`Unified Action created: INVITE from ${currentUser.name} to ${candidate.name} for ${team.projectName}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        message: "Invitation sent successfully",
        actionId: action._id,
        status: action.status
      });
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error sending invite:", err.message);
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(400).json({ error: err.message });
    }
    res.redirect("/?error=" + encodeURIComponent(err.message));
  }
});

// -----------------------------------------------------------------
// 2. POST /invites/:id/accept - Candidate accepts invitation
// NOTE: Accepting never locks; the requester confirms!
// -----------------------------------------------------------------
router.post("/:id/accept", requireLogin, async (req, res) => {
  try {
    const action = await acceptAction(req.params.id, req.user._id);
    console.log(`Action ${action._id} ACCEPTED by ${req.user.name}. Awaiting requester confirmation.`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, status: "ACCEPTED", message: "Accepted. Awaiting requester confirmation." });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error accepting invite:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 3. POST /invites/:id/confirm - Requester confirms match -> LOCKED
// -----------------------------------------------------------------
router.post("/:id/confirm", requireLogin, async (req, res) => {
  try {
    const action = await confirmAction(req.params.id, req.user._id);
    console.log(`Action ${action._id} CONFIRMED & LOCKED by ${req.user.name}.`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, status: "LOCKED", message: "Match officially locked for this event." });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error confirming invite:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 4. POST /invites/:id/decline - Candidate declines invitation
// -----------------------------------------------------------------
router.post("/:id/decline", requireLogin, async (req, res) => {
  try {
    const action = await declineAction(req.params.id, req.user._id);
    console.log(`Action ${action._id} DECLINED by ${req.user.name}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, status: "DECLINED" });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error declining invite:", err.message);
    res.status(400).send(err.message);
  }
});

// -----------------------------------------------------------------
// 5. POST /invites/:id/contact-consent - Opt in to share contact details
// -----------------------------------------------------------------
router.post("/:id/contact-consent", requireLogin, async (req, res) => {
  try {
    const action = await optInContactSharing(req.params.id, req.user._id);
    const bothOptedIn = action.senderContactOptIn && action.receiverContactOptIn;

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        bothOptedIn,
        message: bothOptedIn ? "Contacts shared!" : "Opt-in recorded. Waiting for teammate."
      });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error updating contact consent:", err.message);
    res.status(400).send(err.message);
  }
});

module.exports = router;
