const TeamRequestAction = require("../models/TeamRequestAction");
const TeamRequirement = require("../models/TeamRequirement");
const Event = require("../models/Event");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Invite = require("../models/Invite");
const Application = require("../models/Application");
const Shortlist = require("../models/Shortlist");

/**
 * Creates and logs a notification for a user.
 */
async function sendNotification(userId, title, subtitle, type = "info", actionId = null, link = "") {
  try {
    const notif = new Notification({
      userId,
      title,
      subtitle,
      type,
      actionId,
      link
    });
    await notif.save();
    return notif;
  } catch (err) {
    console.warn("Could not save notification:", err.message);
  }
}

/**
 * Creates a new unified team request action (INVITE or APPLY).
 */
async function createAction({ senderId, receiverId, teamRequirementId, role, direction }) {
  const team = await TeamRequirement.findById(teamRequirementId);
  if (!team) {
    throw new Error("Team requirement not found.");
  }

  const eventId = team.eventId || null;
  const eventLockKey = eventId ? eventId.toString() : team.projectName;

  // Verify candidate is not locked for this event
  const candidateId = direction === "INVITE" ? receiverId : senderId;
  const candidate = await User.findById(candidateId);
  if (candidate && eventLockKey && candidate.lockedEvents && candidate.lockedEvents.includes(eventLockKey)) {
    throw new Error("Candidate is already committed to a team for this event.");
  }

  // Check duplicate pending action
  const existing = await TeamRequestAction.findOne({
    teamRequirementId,
    role,
    senderId,
    receiverId,
    status: { $in: ["PENDING", "ACCEPTED", "CONFIRMED"] }
  });
  if (existing) {
    throw new Error(`A ${direction.toLowerCase()} action already exists for this candidate and role.`);
  }

  const action = new TeamRequestAction({
    senderId,
    receiverId,
    teamRequirementId,
    eventId,
    role,
    direction,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  await action.save();

  // Notify recipient
  const sender = await User.findById(senderId);
  const senderName = sender ? sender.name : "A student";
  if (direction === "INVITE") {
    // Phase 7: Log a shortlist row whenever an invite is sent (unique per requester)
    try {
      await Shortlist.findOneAndUpdate(
        { requesterId: senderId, candidateId: receiverId },
        {
          requesterId: senderId,
          candidateId: receiverId,
          teamRequirementId,
          actionId: action._id
        },
        { upsert: true, new: true }
      );
      // Update candidate's unique shortlisters count
      const uniqueCount = await Shortlist.countDocuments({ candidateId: receiverId });
      await User.findByIdAndUpdate(receiverId, { uniqueShortlisters: uniqueCount });
    } catch (shortlistErr) {
      console.warn("Could not record shortlist row:", shortlistErr.message);
    }

    await sendNotification(
      receiverId,
      `New team invitation from ${senderName}`,
      `Invited to join ${team.projectName} as ${role}`,
      "invite",
      action._id,
      "/"
    );
  } else {
    await sendNotification(
      receiverId,
      `New application from ${senderName}`,
      `Applied for ${role} in ${team.projectName}`,
      "info",
      action._id,
      `/applications/team/${team._id}`
    );
  }

  return action;
}

/**
 * Recipient ACCEPTS the action.
 * NOTE: Accepting NEVER locks! The requester must subsequently confirm.
 */
async function acceptAction(actionId, userId) {
  const action = await TeamRequestAction.findById(actionId)
    .populate("teamRequirementId")
    .populate("senderId")
    .populate("receiverId");

  if (!action) {
    throw new Error("Action not found.");
  }

  if (action.status !== "PENDING") {
    throw new Error(`Cannot accept action with status ${action.status}`);
  }

  // Only the receiver can accept
  if (!action.receiverId._id.equals(userId)) {
    throw new Error("Unauthorized: Only the recipient can accept this request.");
  }

  action.status = "ACCEPTED";
  // Set 24h confirmation timeout for the requester
  action.confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await action.save();

  const receiverName = action.receiverId ? action.receiverId.name : "Recipient";
  const teamName = action.teamRequirementId ? action.teamRequirementId.projectName : "Team";

  // Notify the requester (sender) to CONFIRM
  if (action.direction === "INVITE") {
    // Sender is Team Lead
    await sendNotification(
      action.senderId._id,
      `${receiverName} accepted your invite!`,
      `Please confirm to lock ${receiverName} into ${teamName} as ${action.role}. (Expires in 24h)`,
      "success",
      action._id,
      "/"
    );
  } else {
    // Sender is Candidate
    await sendNotification(
      action.senderId._id,
      `Your application for ${action.role} was accepted!`,
      `The team lead accepted your application. Please confirm your spot in ${teamName}! (Expires in 24h)`,
      "success",
      action._id,
      "/notifications"
    );
  }

  return action;
}

/**
 * Requester CONFIRMS the action.
 * Transitions to CONFIRMED -> LOCKED.
 * Writes locked_events for the event only and decrements role openings.
 * If openings reach 0, other pending actions become "ROLE_FILLED".
 */
async function confirmAction(actionId, userId) {
  const action = await TeamRequestAction.findById(actionId)
    .populate("teamRequirementId")
    .populate("senderId")
    .populate("receiverId");

  if (!action) {
    throw new Error("Action not found.");
  }

  if (action.status !== "ACCEPTED") {
    throw new Error(`Cannot confirm action with status ${action.status}. It must be in ACCEPTED state.`);
  }

  // Only the requester (sender) confirms!
  if (!action.senderId._id.equals(userId)) {
    throw new Error("Unauthorized: Only the initiating requester can confirm this match.");
  }

  const team = await TeamRequirement.findById(action.teamRequirementId._id);
  if (!team) {
    throw new Error("Team requirement no longer exists.");
  }

  const eventId = team.eventId || action.eventId;
  const eventLockKey = eventId ? eventId.toString() : team.projectName;

  // The candidate being locked
  const candidateId = action.direction === "INVITE" ? action.receiverId._id : action.senderId._id;
  const candidate = await User.findById(candidateId);

  if (candidate && eventLockKey && candidate.lockedEvents && candidate.lockedEvents.includes(eventLockKey)) {
    throw new Error("Candidate is already locked into another team for this event.");
  }

  // Find role and check openings
  let roleFilled = false;
  if (Array.isArray(team.roles)) {
    const roleObj = team.roles.find(r => r.title.toLowerCase().trim() === action.role.toLowerCase().trim());
    if (roleObj) {
      if (roleObj.openings > 0) {
        roleObj.openings -= 1;
        await team.save();
        console.log(`Decreased openings for role ${roleObj.title} in ${team.projectName}. Remaining: ${roleObj.openings}`);
        if (roleObj.openings === 0) {
          roleFilled = true;
        }
      } else {
        throw new Error("This role has no openings remaining.");
      }
    }
  }

  // Lock candidate for this event only
  if (candidate && eventLockKey) {
    if (!candidate.lockedEvents.includes(eventLockKey)) {
      candidate.lockedEvents.push(eventLockKey);
      await candidate.save();
    }
  }

  // Move status to CONFIRMED then LOCKED
  action.status = "LOCKED";
  action.confirmedByRequester = true;
  action.confirmationExpiresAt = null;
  await action.save();

  // If role filled, transition other pending/accepted actions to ROLE_FILLED
  if (roleFilled) {
    const otherActions = await TeamRequestAction.find({
      teamRequirementId: team._id,
      role: action.role,
      _id: { $ne: action._id },
      status: { $in: ["PENDING", "ACCEPTED"] }
    });

    for (const other of otherActions) {
      other.status = "ROLE_FILLED";
      await other.save();
      const notifyUserId = other.direction === "INVITE" ? other.receiverId : other.senderId;
      await sendNotification(
        notifyUserId,
        `Role Filled: ${action.role} at ${team.projectName}`,
        "The opening has been confirmed and filled by another candidate.",
        "info",
        other._id
      );
    }
  }

  // Send mutual locked confirmation notifications
  await sendNotification(
    action.senderId._id,
    `Match Confirmed & Locked! 🔒`,
    `You are now officially matched for ${action.role} at ${team.projectName}.`,
    "success",
    action._id
  );
  await sendNotification(
    action.receiverId._id,
    `Match Confirmed & Locked! 🔒`,
    `You are now officially matched for ${action.role} at ${team.projectName}.`,
    "success",
    action._id
  );

  return action;
}

/**
 * Either party declines the action.
 */
async function declineAction(actionId, userId) {
  const action = await TeamRequestAction.findById(actionId)
    .populate("teamRequirementId")
    .populate("senderId")
    .populate("receiverId");

  if (!action) {
    throw new Error("Action not found.");
  }

  // Only participant can decline
  if (!action.senderId._id.equals(userId) && !action.receiverId._id.equals(userId)) {
    throw new Error("Unauthorized: You are not a participant in this action.");
  }

  action.status = "DECLINED";
  action.confirmationExpiresAt = null;
  await action.save();

  // Notify the other party
  const otherUserId = action.senderId._id.equals(userId) ? action.receiverId._id : action.senderId._id;
  await sendNotification(
    otherUserId,
    `Action Declined`,
    `The request for ${action.role} was declined.`,
    "danger",
    action._id
  );

  return action;
}

/**
 * Mutual contact sharing step: both sides must opt in before contacts show.
 */
async function optInContactSharing(actionId, userId) {
  const action = await TeamRequestAction.findById(actionId)
    .populate("senderId")
    .populate("receiverId");

  if (!action) {
    throw new Error("Action not found.");
  }

  if (action.senderId._id.equals(userId)) {
    action.senderContactOptIn = true;
  } else if (action.receiverId._id.equals(userId)) {
    action.receiverContactOptIn = true;
  } else {
    throw new Error("Unauthorized: You are not a participant in this action.");
  }

  await action.save();

  // If both opted in, notify both that contacts are now visible
  if (action.senderContactOptIn && action.receiverContactOptIn) {
    await sendNotification(
      action.senderId._id,
      "Mutual Contact Sharing Unlocked! 📱",
      `You and ${action.receiverId.name} can now view each other's contact details.`,
      "success",
      action._id
    );
    await sendNotification(
      action.receiverId._id,
      "Mutual Contact Sharing Unlocked! 📱",
      `You and ${action.senderId.name} can now view each other's contact details.`,
      "success",
      action._id
    );
  }

  return action;
}

/**
 * Background / on-demand check for timeouts, warnings, and auto-expiry.
 */
async function checkTimeoutsAndExpiries() {
  const now = new Date();

  // 1. Check PENDING actions that reached expiresAt -> EXPIRED (no reputation penalty)
  const expiredPending = await TeamRequestAction.find({
    status: "PENDING",
    expiresAt: { $lt: now }
  });
  for (const act of expiredPending) {
    act.status = "EXPIRED";
    await act.save();
    await sendNotification(
      act.receiverId,
      "Request Expired",
      `The ${act.direction.toLowerCase()} for ${act.role} has expired with no penalty.`,
      "info",
      act._id
    );
  }

  // 2. Check ACCEPTED actions where requester confirmation timed out -> release candidate
  const timedOutConfirmations = await TeamRequestAction.find({
    status: "ACCEPTED",
    confirmationExpiresAt: { $lt: now }
  });
  for (const act of timedOutConfirmations) {
    act.status = "EXPIRED";
    await act.save();
    await sendNotification(
      act.senderId,
      "Confirmation Timed Out",
      `The 24h confirmation window for ${act.role} expired. Candidate spot released.`,
      "warning",
      act._id
    );
    await sendNotification(
      act.receiverId,
      "Spot Released",
      `Confirmation timed out for ${act.role}. Your availability has been released.`,
      "info",
      act._id
    );
  }

  // 3. 24h reminder for pending actions closing soon
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const closingSoon = await TeamRequestAction.find({
    status: "PENDING",
    expiresAt: { $lte: in24h, $gt: now },
    reminderSent24h: false
  });
  for (const act of closingSoon) {
    act.reminderSent24h = true;
    await act.save();
    await sendNotification(
      act.receiverId,
      "Closing Soon: 24h Reminder ⏰",
      `Your pending ${act.direction.toLowerCase()} for ${act.role} will expire in 24 hours.`,
      "warning",
      act._id
    );
  }
}

/**
 * Migrates existing Invite and Application records into TeamRequestAction collection.
 */
async function migrateLegacyData() {
  try {
    // 1. Migrate Invites -> direction: "INVITE"
    const invites = await Invite.find();
    for (const inv of invites) {
      const existing = await TeamRequestAction.findOne({
        senderId: inv.senderId,
        receiverId: inv.receiverId,
        teamRequirementId: inv.teamRequirementId,
        role: inv.role
      });
      if (!existing) {
        let status = "PENDING";
        if (inv.status === "ACCEPTED") status = "ACCEPTED";
        if (inv.status === "DECLINED") status = "DECLINED";

        await TeamRequestAction.create({
          senderId: inv.senderId,
          receiverId: inv.receiverId,
          teamRequirementId: inv.teamRequirementId,
          role: inv.role,
          direction: "INVITE",
          status,
          createdAt: inv.createdAt
        });
      }
    }

    // 2. Migrate Applications -> direction: "APPLY"
    const applications = await Application.find().populate("teamRequirementId");
    for (const app of applications) {
      if (!app.teamRequirementId) continue;
      const teamCreator = app.teamRequirementId.createdBy;
      if (!teamCreator) continue;

      const existing = await TeamRequestAction.findOne({
        senderId: app.applicantId,
        receiverId: teamCreator,
        teamRequirementId: app.teamRequirementId._id,
        role: app.role
      });

      if (!existing) {
        let status = "PENDING";
        if (app.status === "ACCEPTED") status = "ACCEPTED";
        if (app.status === "REJECTED") status = "DECLINED";

        await TeamRequestAction.create({
          senderId: app.applicantId,
          receiverId: teamCreator,
          teamRequirementId: app.teamRequirementId._id,
          role: app.role,
          direction: "APPLY",
          status,
          createdAt: app.createdAt
        });
      }
    }
    console.log("Legacy Invites and Applications successfully synced to team_request_actions.");
  } catch (err) {
    console.warn("Legacy migration notice:", err.message);
  }
}

module.exports = {
  createAction,
  acceptAction,
  confirmAction,
  declineAction,
  optInContactSharing,
  checkTimeoutsAndExpiries,
  migrateLegacyData,
  sendNotification
};
