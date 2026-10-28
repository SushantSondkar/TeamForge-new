const TeamRequestAction = require("../models/TeamRequestAction");
const TeamRequirement = require("../models/TeamRequirement");
const Event = require("../models/Event");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Invite = require("../models/Invite");
const Application = require("../models/Application");
const Shortlist = require("../models/Shortlist");
const { sendMail } = require("./mailer");
const {
  actionReminder,
  actionClosingSoon,
  actionExpired,
  confirmationTimeout,
  notificationEmail
} = require("./emailTemplates");

// In-memory 5-minute notification batching map: userId -> { timer, notifications: [], user }
const pendingNotificationBatches = new Map();
const NOTIF_BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Safe email dispatcher respecting user.emailNotifications setting.
 */
async function safeSendEmail(user, template) {
  try {
    if (!user || !user.email) return;
    if (user.emailNotifications === false) return;
    await sendMail({
      to: user.email,
      subject: template.subject,
      text: template.text,
      html: template.html
    });
  } catch (err) {
    console.warn("[ActionStateMachine] Email notification skipped:", err.message);
  }
}

/**
 * Flushes a specific user's pending notification batch and sends the digest email.
 */
async function flushUserBatch(userIdStr) {
  const batch = pendingNotificationBatches.get(userIdStr);
  if (!batch) return;
  pendingNotificationBatches.delete(userIdStr);

  try {
    const user = batch.user || await User.findById(userIdStr);
    if (!user || user.emailNotifications === false) return;
    if (!batch.notifications || batch.notifications.length === 0) return;

    const emailPayload = notificationEmail(user, batch.notifications);
    await safeSendEmail(user, emailPayload);
  } catch (err) {
    console.warn("[ActionStateMachine] Failed to send batched notification email:", err.message);
  }
}

/**
 * Flush all currently pending batches immediately (useful for testing and deterministic flush).
 */
async function flushAllNotificationBatches() {
  const keys = Array.from(pendingNotificationBatches.keys());
  for (const k of keys) {
    const b = pendingNotificationBatches.get(k);
    if (b && b.timer) clearTimeout(b.timer);
    await flushUserBatch(k);
  }
}

function getPendingNotificationBatches() {
  return pendingNotificationBatches;
}

/**
 * Queues a notification for batched email delivery (5-minute window).
 * If user.emailNotifications is false, skips immediately.
 */
async function queueNotificationEmail(userId, notif) {
  try {
    const userIdStr = userId.toString();
    const user = await User.findById(userId);
    if (!user || user.emailNotifications === false) return;

    const notifItem = {
      title: notif.title,
      subtitle: notif.subtitle,
      link: notif.link
    };

    if (pendingNotificationBatches.has(userIdStr)) {
      const existing = pendingNotificationBatches.get(userIdStr);
      existing.notifications.push(notifItem);
    } else {
      const timer = setTimeout(() => {
        flushUserBatch(userIdStr);
      }, NOTIF_BATCH_WINDOW_MS);
      if (timer.unref) timer.unref();

      pendingNotificationBatches.set(userIdStr, {
        user,
        notifications: [notifItem],
        timer
      });
    }
  } catch (err) {
    console.warn("[ActionStateMachine] Error queueing notification email:", err.message);
  }
}

/**
 * Creates and logs a notification for a user, queueing batched email delivery.
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

    // Queue email notification with 5-minute batching (respecting emailNotifications setting)
    await queueNotificationEmail(userId, notif);

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
  if (direction === "INVITE" && candidate && candidate.isProfileHidden) {
    throw new Error("Candidate's profile is hidden and cannot receive invitations.");
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
        { returnDocument: 'after' }
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
      "/dashboard"
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

  // Idempotent: If already ACCEPTED or LOCKED, return action safely
  if (action.status === "ACCEPTED" || action.status === "LOCKED") {
    return action;
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
    const teamId = action.teamRequirementId ? (action.teamRequirementId._id || action.teamRequirementId) : "";
    const inviteAcceptedLink = teamId ? `/applications/team/${teamId}#tab-sent-invitations` : "/actions";
    await sendNotification(
      action.senderId._id,
      `${receiverName} accepted your invite!`,
      `Please confirm to lock ${receiverName} into ${teamName} as ${action.role}. (Expires in 24h)`,
      "success",
      action._id,
      inviteAcceptedLink
    );
  } else {
    // Sender is Candidate
    await sendNotification(
      action.senderId._id,
      `Your application for ${action.role} was accepted!`,
      `The team lead accepted your application. Please confirm your spot in ${teamName}! (Expires in 24h)`,
      "success",
      action._id,
      "/dashboard"
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

  // Idempotent: If already LOCKED, return immediately without re-decrementing
  if (action.status === "LOCKED") {
    return action;
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

  // Safely find and decrement role opening atomically
  let roleFilled = false;
  const updatedTeam = await TeamRequirement.findOneAndUpdate(
    {
      _id: team._id,
      "roles.title": { $regex: new RegExp(`^${action.role.trim()}$`, "i") },
      "roles.openings": { $gt: 0 }
    },
    {
      $inc: { "roles.$.openings": -1 }
    },
    { returnDocument: 'after' }
  );

  if (!updatedTeam) {
    throw new Error("This role has no openings remaining.");
  }

  const updatedRole = updatedTeam.roles.find(r => r.title.toLowerCase().trim() === action.role.toLowerCase().trim());
  if (updatedRole && updatedRole.openings === 0) {
    roleFilled = true;
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
      status: "PENDING"
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
    action._id,
    "/actions"
  );
  await sendNotification(
    action.receiverId._id,
    `Match Confirmed & Locked! 🔒`,
    `You are now officially matched for ${action.role} at ${team.projectName}.`,
    "success",
    action._id,
    "/actions"
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
    .populate("receiverId")
    .populate("teamRequirementId");

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
    const teamId = action.teamRequirementId ? (action.teamRequirementId._id || action.teamRequirementId) : "";
    let senderLink = "/dashboard";
    let receiverLink = "/dashboard";
    if (teamId) {
      if (action.direction === "INVITE") {
        // Sender is team lead (owner) -> team management page; receiver is candidate -> dashboard
        senderLink = `/applications/team/${teamId}`;
        receiverLink = "/dashboard";
      } else {
        // Sender is candidate -> dashboard; receiver is team lead (owner) -> team management page
        senderLink = "/dashboard";
        receiverLink = `/applications/team/${teamId}`;
      }
    }
    await sendNotification(
      action.senderId._id,
      "Mutual Contact Sharing Unlocked! 📱",
      `You and ${action.receiverId.name} can now view each other's contact details.`,
      "success",
      action._id,
      senderLink
    );
    await sendNotification(
      action.receiverId._id,
      "Mutual Contact Sharing Unlocked! 📱",
      `You and ${action.senderId.name} can now view each other's contact details.`,
      "success",
      action._id,
      receiverLink
    );
  }

  return action;
}

/**
 * Background / on-demand check for timeouts, warnings, and auto-expiry.
 * Fully idempotent: records reminderSentAt and expiredAt so actions are processed once.
 * Respects user emailNotifications setting.
 * Emits one summary line with counts only.
 */
async function checkTimeoutsAndExpiries() {
  const now = new Date();
  let expiredPendingCount = 0;
  let timedOutConfirmationsCount = 0;
  let remindersSentCount = 0;
  let closingSoonCount = 0;

  // 1. Check PENDING actions that reached expiresAt -> EXPIRED (no reputation penalty)
  const expiredPending = await TeamRequestAction.find({
    status: "PENDING",
    expiresAt: { $lt: now }
  }).populate("receiverId").populate("senderId").populate("teamRequirementId");

  for (const act of expiredPending) {
    act.status = "EXPIRED";
    act.expiredAt = now;
    await act.save();
    expiredPendingCount++;

    const receiverId = act.receiverId?._id || act.receiverId;
    const teamName = act.teamRequirementId ? act.teamRequirementId.projectName : "Team";
    await sendNotification(
      receiverId,
      "Request Expired",
      `The ${act.direction.toLowerCase()} for ${act.role} has expired with no penalty.`,
      "info",
      act._id
    );

    if (act.receiverId && act.receiverId.email) {
      await safeSendEmail(
        act.receiverId,
        actionExpired({
          name: act.receiverId.name,
          role: act.role,
          projectName: teamName,
          direction: act.direction
        })
      );
    }
  }

  // 2. Check ACCEPTED actions where requester confirmation timed out -> release candidate
  const timedOutConfirmations = await TeamRequestAction.find({
    status: "ACCEPTED",
    confirmationExpiresAt: { $lt: now }
  }).populate("receiverId").populate("senderId").populate("teamRequirementId");

  for (const act of timedOutConfirmations) {
    act.status = "EXPIRED";
    act.expiredAt = now;
    await act.save();
    timedOutConfirmationsCount++;

    const senderId = act.senderId?._id || act.senderId;
    const receiverId = act.receiverId?._id || act.receiverId;
    const teamName = act.teamRequirementId ? act.teamRequirementId.projectName : "Team";

    await sendNotification(
      senderId,
      "Confirmation Timed Out",
      `The 24h confirmation window for ${act.role} expired. Candidate spot released.`,
      "warning",
      act._id
    );
    await sendNotification(
      receiverId,
      "Spot Released",
      `Confirmation timed out for ${act.role}. Your availability has been released.`,
      "info",
      act._id
    );

    if (act.senderId && act.senderId.email) {
      await safeSendEmail(
        act.senderId,
        confirmationTimeout({
          name: act.senderId.name,
          role: act.role,
          projectName: teamName
        })
      );
    }
    if (act.receiverId && act.receiverId.email) {
      await safeSendEmail(
        act.receiverId,
        confirmationTimeout({
          name: act.receiverId.name,
          role: act.role,
          projectName: teamName
        })
      );
    }
  }

  // 3. 24h reminder for pending actions (sent once per action after 24h elapsed or within 24h of expiry)
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pendingReminders = await TeamRequestAction.find({
    status: "PENDING",
    reminderSent24h: false,
    reminderSentAt: null,
    expiresAt: { $gt: now },
    $or: [
      { createdAt: { $lte: past24h } },
      { expiresAt: { $lte: in24h } }
    ]
  }).populate("receiverId").populate("senderId").populate("teamRequirementId");

  for (const act of pendingReminders) {
    act.reminderSent24h = true;
    act.reminderSentAt = now;
    await act.save();
    remindersSentCount++;

    const receiverId = act.receiverId?._id || act.receiverId;
    const teamName = act.teamRequirementId ? act.teamRequirementId.projectName : "Team";

    await sendNotification(
      receiverId,
      "Action Reminder ⏰",
      `You have a pending ${act.direction.toLowerCase()} for ${act.role} in ${teamName}.`,
      "warning",
      act._id
    );

    if (act.receiverId && act.receiverId.email) {
      await safeSendEmail(
        act.receiverId,
        actionReminder({
          name: act.receiverId.name,
          role: act.role,
          projectName: teamName,
          direction: act.direction
        })
      );
    }
  }

  // 4. Closing soon warning (sent once when pending action is within 24h of expiresAt)
  const closingSoon = await TeamRequestAction.find({
    status: "PENDING",
    closingSoonWarningSent: false,
    closingSoonSentAt: null,
    expiresAt: { $lte: in24h, $gt: now },
    _id: { $nin: pendingReminders.map(a => a._id) }
  }).populate("receiverId").populate("senderId").populate("teamRequirementId");

  for (const act of closingSoon) {
    act.closingSoonWarningSent = true;
    act.closingSoonSentAt = now;
    await act.save();
    closingSoonCount++;

    const receiverId = act.receiverId?._id || act.receiverId;
    const teamName = act.teamRequirementId ? act.teamRequirementId.projectName : "Team";

    await sendNotification(
      receiverId,
      "Closing Soon: 24h Warning ⏰",
      `Your pending ${act.direction.toLowerCase()} for ${act.role} will expire in 24 hours.`,
      "warning",
      act._id
    );

    if (act.receiverId && act.receiverId.email) {
      await safeSendEmail(
        act.receiverId,
        actionClosingSoon({
          name: act.receiverId.name,
          role: act.role,
          projectName: teamName,
          direction: act.direction
        })
      );
    }
  }

  // 5. Log ONE summary line per run (counts only, no user data)
  console.log(
    `[Scheduler] checkTimeoutsAndExpiries: ${expiredPendingCount} expired pending, ${timedOutConfirmationsCount} confirmation timeouts, ${remindersSentCount} reminders sent, ${closingSoonCount} closing soon warnings.`
  );

  return {
    expiredPendingCount,
    timedOutConfirmationsCount,
    remindersSentCount,
    closingSoonCount
  };
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
  sendNotification,
  flushAllNotificationBatches,
  getPendingNotificationBatches
};

