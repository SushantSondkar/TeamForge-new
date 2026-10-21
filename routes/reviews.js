const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const TeamReview = require("../models/TeamReview");
const Notification = require("../models/Notification");
const requireLogin = require("../middleware/auth");

/**
 * Helper to recalculate aggregate teammateRating and reviewCount for a user
 */
async function updateUserReputation(userId) {
  const reviews = await TeamReview.find({ revieweeId: userId, isRevealed: true });
  if (reviews.length === 0) return;

  const totalScore = reviews.reduce((sum, r) => sum + r.overallScore, 0);
  const avgFiveStar = totalScore / reviews.length;

  await User.findByIdAndUpdate(userId, {
    teammateRating: Math.round((avgFiveStar / 5.0) * 100) / 100, // normalized 0-1 scale
    reviewCount: reviews.length
  });
}

// -------------------------------------------------------------
// 1. GET /reviews - Dashboard of pending and revealed reviews
// -------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const currentUser = req.user;
    const now = new Date();

    // 1. Find all locked matches for this user
    const lockedActions = await TeamRequestAction.find({
      $or: [{ senderId: currentUser._id }, { receiverId: currentUser._id }],
      status: "LOCKED"
    })
      .populate("eventId")
      .populate("teamRequirementId")
      .populate("senderId", "name email department role skills")
      .populate("receiverId", "name email department role skills");

    // 2. Identify teammates and check whether event date has passed
    const reviewOpportunities = [];

    for (const act of lockedActions) {
      if (!act.eventId) continue;

      const eventDate = new Date(act.eventId.date);
      const isEventPassed = eventDate <= now;

      // Determine who the peer is
      const peer = act.senderId._id.equals(currentUser._id) ? act.receiverId : act.senderId;
      const isRequester = act.senderId._id.equals(currentUser._id);

      // Check if current user already reviewed this peer for this event
      const myReview = await TeamReview.findOne({
        reviewerId: currentUser._id,
        revieweeId: peer._id,
        eventId: act.eventId._id
      });

      // Check if peer already reviewed current user for this event
      const peerReview = await TeamReview.findOne({
        reviewerId: peer._id,
        revieweeId: currentUser._id,
        eventId: act.eventId._id
      });

      reviewOpportunities.push({
        action: act,
        event: act.eventId,
        team: act.teamRequirementId,
        peer,
        isRequester,
        isEventPassed,
        eventDate,
        myReview,
        peerReview,
        isRevealed: !!(myReview && myReview.isRevealed)
      });
    }

    // 3. Revealed reviews received by current user
    const receivedReviews = await TeamReview.find({
      revieweeId: currentUser._id,
      isRevealed: true
    })
      .populate("reviewerId", "name role department")
      .populate("eventId", "name organizer date")
      .sort({ createdAt: -1 });

    res.render("reviews/index", {
      reviewOpportunities,
      receivedReviews,
      currentUser,
      query: req.query
    });
  } catch (err) {
    console.error("Error loading reviews page:", err.message);
    res.status(500).send("Error loading reviews page.");
  }
});

// -------------------------------------------------------------
// 2. GET /events/:eventId/review/:peerId - Render double-blind review form
// -------------------------------------------------------------
router.get("/events/:eventId/review/:peerId", requireLogin, async (req, res) => {
  try {
    const { eventId, peerId } = req.params;
    const currentUser = req.user;
    const now = new Date();

    if (currentUser._id.equals(peerId)) {
      return res.status(400).send("You cannot review yourself.");
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    // Unlocks ONLY after the event date passes
    if (new Date(event.date) > now) {
      return res.status(400).send(
        `Reviews and peer skill verifications unlock after the event date (${new Date(event.date).toLocaleDateString()}).`
      );
    }

    const peer = await User.findById(peerId);
    if (!peer) {
      return res.status(404).send("Teammate not found.");
    }

    // Verify locked teammate relationship for this event
    const lockedAction = await TeamRequestAction.findOne({
      eventId: event._id,
      status: "LOCKED",
      $or: [
        { senderId: currentUser._id, receiverId: peer._id },
        { senderId: peer._id, receiverId: currentUser._id }
      ]
    }).populate("teamRequirementId");

    if (!lockedAction) {
      return res.status(403).send("Unauthorized: You were not locked into a team with this student for this event.");
    }

    // Check if already reviewed
    const existingReview = await TeamReview.findOne({
      reviewerId: currentUser._id,
      revieweeId: peer._id,
      eventId: event._id
    });

    if (existingReview) {
      return res.redirect("/reviews?info=" + encodeURIComponent("You have already submitted your review for this teammate."));
    }

    const isRequester = lockedAction.senderId.equals(currentUser._id);

    res.render("reviews/form", {
      event,
      peer,
      team: lockedAction.teamRequirementId,
      isRequester,
      currentUser,
      error: null
    });
  } catch (err) {
    console.error("Error loading review form:", err.message);
    res.status(500).send("Error loading review form.");
  }
});

// -------------------------------------------------------------
// 3. POST /events/:eventId/review/:peerId - Submit double-blind review & peer skill verification
// -------------------------------------------------------------
router.post("/events/:eventId/review/:peerId", requireLogin, async (req, res) => {
  try {
    const { eventId, peerId } = req.params;
    const currentUser = req.user;
    const now = new Date();

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).send("Event not found.");
    }

    // Unlocks ONLY after event date
    if (new Date(event.date) > now) {
      return res.status(400).send(
        `Reviews and peer skill verifications unlock after the event date (${new Date(event.date).toLocaleDateString()}).`
      );
    }

    const peer = await User.findById(peerId);
    if (!peer) {
      return res.status(404).send("Teammate not found.");
    }

    // Verify locked teammate relationship
    const lockedAction = await TeamRequestAction.findOne({
      eventId: event._id,
      status: "LOCKED",
      $or: [
        { senderId: currentUser._id, receiverId: peer._id },
        { senderId: peer._id, receiverId: currentUser._id }
      ]
    });

    if (!lockedAction) {
      return res.status(403).send("Unauthorized: You were not locked into a team with this student for this event.");
    }

    // Check duplicate review
    const existing = await TeamReview.findOne({
      reviewerId: currentUser._id,
      revieweeId: peer._id,
      eventId: event._id
    });
    if (existing) {
      return res.redirect("/reviews");
    }

    // Parse ratings (1 to 5)
    const technicalContribution = Math.min(5, Math.max(1, parseInt(req.body.technicalContribution, 10) || 3));
    const reliability = Math.min(5, Math.max(1, parseInt(req.body.reliability, 10) || 3));
    const communication = Math.min(5, Math.max(1, parseInt(req.body.communication, 10) || 3));
    const teamwork = Math.min(5, Math.max(1, parseInt(req.body.teamwork, 10) || 3));
    const feedback = (req.body.feedback || "").trim();

    // Peer skill verification: requester ticks observed skills
    let observedSkills = [];
    if (req.body.observedSkills) {
      if (Array.isArray(req.body.observedSkills)) {
        observedSkills = req.body.observedSkills;
      } else if (typeof req.body.observedSkills === "string") {
        observedSkills = [req.body.observedSkills];
      }
    }

    const isRequester = lockedAction.senderId.equals(currentUser._id);

    // If requester, verify ticked skills on peer user document
    // Unticked skills stay unverified, never "rejected"!
    if (isRequester && observedSkills.length > 0 && Array.isArray(peer.skills)) {
      peer.skills.forEach(skill => {
        if (observedSkills.includes(skill.name)) {
          skill.verifiedBy = skill.verifiedBy || [];
          const alreadyVerified = skill.verifiedBy.some(id => id.equals(currentUser._id));
          if (!alreadyVerified) {
            skill.verifiedBy.push(currentUser._id);
            skill.distinctVerifiers = skill.verifiedBy.length;
          }
        }
        // Unticked skills are completely untouched (unverified, not rejected)
      });
      await peer.save();
    }

    // Create review record
    const review = new TeamReview({
      reviewerId: currentUser._id,
      revieweeId: peer._id,
      eventId: event._id,
      teamRequirementId: lockedAction.teamRequirementId,
      actionId: lockedAction._id,
      technicalContribution,
      reliability,
      communication,
      teamwork,
      feedback,
      observedSkills,
      isRevealed: false
    });

    // Check if peer has also submitted their review for this event (Double-Blind check)
    const peerReview = await TeamReview.findOne({
      reviewerId: peer._id,
      revieweeId: currentUser._id,
      eventId: event._id
    });

    if (peerReview) {
      // Both sides have submitted: REVEAL BOTH!
      review.isRevealed = true;
      review.revealedAt = now;
      await review.save();

      peerReview.isRevealed = true;
      peerReview.revealedAt = now;
      await peerReview.save();

      // Recalculate reputation ratings for both users
      await updateUserReputation(currentUser._id);
      await updateUserReputation(peer._id);

      // Notify both teammates
      await Notification.create({
        userId: currentUser._id,
        title: "Team Reviews Revealed! 🌟",
        subtitle: `Both you and ${peer.name} have submitted reviews for ${event.name}. Your mutual feedback is now unlocked.`,
        type: "success",
        link: "/reviews"
      });

      await Notification.create({
        userId: peer._id,
        title: "Team Reviews Revealed! 🌟",
        subtitle: `Both you and ${currentUser.name} have submitted reviews for ${event.name}. Your mutual feedback is now unlocked.`,
        type: "success",
        link: "/reviews"
      });
    } else {
      // Only one side submitted: keep hidden
      await review.save();

      // Notify peer that a review is waiting for them to unlock
      await Notification.create({
        userId: peer._id,
        title: "Hackathon Review Submitted 🔒",
        subtitle: `${currentUser.name} submitted their review for ${event.name}. Submit your review to unlock both.`,
        type: "info",
        link: `/events/${event._id}/review/${currentUser._id}`
      });
    }

    res.redirect("/reviews?submitted=true");
  } catch (err) {
    console.error("Error submitting review:", err.message);
    res.status(400).send("Error submitting review: " + err.message);
  }
});

module.exports = router;
