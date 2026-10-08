const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Invite = require("../models/Invite");
const TeamRequirement = require("../models/TeamRequirement");
const requireLogin = require("../middleware/auth");

// -----------------------------------------------------------------
// 1. POST /invites/send - Send a team invitation to a candidate
// -----------------------------------------------------------------
router.post("/send", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    const { receiverId, teamRequirementId, role } = req.body;

    if (!receiverId || !teamRequirementId) {
      return res.status(400).json({ error: "Missing receiverId or teamRequirementId." });
    }

    // 1. Verify candidate exists
    const candidate = await User.findById(receiverId);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    // 2. Verify team requirement exists
    const team = await TeamRequirement.findById(teamRequirementId);
    if (!team) {
      return res.status(404).json({ error: "Team requirement not found." });
    }

    // 3. Verify candidate is not already locked into the event
    if (candidate.lockedEvents && candidate.lockedEvents.includes(team.projectName)) {
      return res.status(400).json({ error: "Candidate is already locked into this event/project." });
    }

    // 4. Check for duplicate pending invite
    const existingInvite = await Invite.findOne({
      senderId: currentUser._id,
      receiverId: candidate._id,
      teamRequirementId: team._id,
      status: "PENDING"
    });

    if (existingInvite) {
      return res.status(400).json({ error: "A pending invite already exists for this candidate." });
    }

    // 5. Create and save new invite
    const newInvite = new Invite({
      senderId: currentUser._id,
      receiverId: candidate._id,
      teamRequirementId: team._id,
      role: role || (team.roles && team.roles[0] ? team.roles[0].title : "Team Member"),
      status: "PENDING"
    });

    await newInvite.save();
    console.log(`Invite created: from ${currentUser.name} to ${candidate.name} for ${team.projectName}`);

    // If client requested JSON (via fetch in dashboard.js)
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({
        success: true,
        message: "Invite sent successfully",
        inviteId: newInvite._id,
        status: "PENDING"
      });
    }

    // Default redirect to dashboard
    res.redirect("/");
  } catch (err) {
    console.error("Error sending invite:", err.message);
    res.status(500).json({ error: `Server error sending invite: ${err.message}` });
  }
});

// -----------------------------------------------------------------
// 2. POST /invites/:id/accept - Candidate accepts invitation
// -----------------------------------------------------------------
router.post("/:id/accept", requireLogin, async (req, res) => {
  try {
    const invite = await Invite.findById(req.params.id);
    if (!invite) {
      return res.status(404).send("Invite not found");
    }

    // Verify current user is the recipient of the invite
    if (!invite.receiverId.equals(req.user._id)) {
      return res.status(403).send("Unauthorized: You cannot accept an invite addressed to someone else.");
    }

    invite.status = "ACCEPTED";
    await invite.save();

    // Lock candidate into project
    const receiver = await User.findById(invite.receiverId);
    const team = await TeamRequirement.findById(invite.teamRequirementId);
    if (receiver && team && team.projectName) {
      if (!receiver.lockedEvents.includes(team.projectName)) {
        receiver.lockedEvents.push(team.projectName);
        await receiver.save();
      }
    }

    console.log(`Invite ${invite._id} ACCEPTED by ${req.user.name}`);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: "ACCEPTED" });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error accepting invite:", err.message);
    res.status(500).send("Error accepting invite");
  }
});

// -----------------------------------------------------------------
// 3. POST /invites/:id/decline - Candidate declines invitation
// -----------------------------------------------------------------
router.post("/:id/decline", requireLogin, async (req, res) => {
  try {
    const invite = await Invite.findById(req.params.id);
    if (!invite) {
      return res.status(404).send("Invite not found");
    }

    // Verify current user is the recipient of the invite
    if (!invite.receiverId.equals(req.user._id)) {
      return res.status(403).send("Unauthorized: You cannot decline an invite addressed to someone else.");
    }

    invite.status = "DECLINED";
    await invite.save();

    console.log(`Invite ${invite._id} DECLINED by ${req.user.name}`);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status: "DECLINED" });
    }
    res.redirect("/");
  } catch (err) {
    console.error("Error declining invite:", err.message);
    res.status(500).send("Error declining invite");
  }
});

module.exports = router;
