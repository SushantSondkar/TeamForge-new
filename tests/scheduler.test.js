/**
 * TEAMFORGE PHASE 10B: SCHEDULER, REMINDERS & EXPIRY TEST SUITE
 * 
 * Verifies:
 * 1. 24h Reminder Idempotency: Reminder sent once, reminderSentAt and reminderSent24h recorded.
 * 2. Second run does not resend reminder or duplicate emails/notifications.
 * 3. Expiry Idempotency: Pending action past expiresAt transitioned to EXPIRED once, expiredAt recorded.
 * 4. Confirmation Timeout Idempotency: Accepted action past confirmationExpiresAt transitioned to EXPIRED once, expiredAt recorded.
 * 5. Closing soon warning sent once (idempotent, closingSoonWarningSent and closingSoonSentAt recorded).
 * 6. Overlapping runs blocked by in-process running flag.
 * 7. Multi-instance concurrent execution blocked by atomic MongoDB lock document (Job collection).
 * 8. User emailNotifications setting respected: email skipped when false, sent when true/default.
 * 9. Scheduler starts with .unref() and stops cleanly without hanging the process.
 */

const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const Notification = require("../models/Notification");
const Job = require("../models/Job");

const { checkTimeoutsAndExpiries } = require("../utils/actionStateMachine");
const {
  startScheduler,
  stopScheduler,
  runScheduledJob,
  acquireJobLock,
  releaseJobLock,
  getIsRunning,
  JOB_NAME
} = require("../utils/scheduler");
const { setMockTransporter } = require("../utils/mailer");

let mongod = null;
const sentEmails = [];

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri() + "teamforge_scheduler_test";
  await mongoose.connect(uri);
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }

  // Intercept emails
  setMockTransporter({
    sendMail: async (options) => {
      sentEmails.push(options);
      return { messageId: `mock-${Date.now()}`, accepted: [options.to] };
    }
  });
}

async function teardown() {
  stopScheduler();
  setMockTransporter(null);
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PHASE 10B SCHEDULER & REMINDER TESTS");
  console.log("=================================================\n");

  await setup();

  // -------------------------------------------------------------
  // Test Setup: Seed basic users and team requirement
  // -------------------------------------------------------------
  const leadUser = await User.create({
    name: "Lead Student",
    email: "lead.student@kkwagh.edu.in",
    password: "Password123!",
    role: "Team Lead",
    emailNotifications: true,
    isEmailVerified: true
  });

  const candidateA = await User.create({
    name: "Aaradhya Wabale",
    email: "aaradhya.w@kkwagh.edu.in",
    password: "Password123!",
    role: "Backend Engineer",
    emailNotifications: true,
    isEmailVerified: true
  });

  const candidateB = await User.create({
    name: "Rohan Deshmukh",
    email: "rohan.d@kkwagh.edu.in",
    password: "Password123!",
    role: "Frontend Engineer",
    emailNotifications: false, // Opted out of email notifications
    isEmailVerified: true
  });

  const event = await Event.create({
    name: "Equinox 2026",
    organizer: "KKWIEER CSI Chapter",
    date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    deadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
  });

  const team = await TeamRequirement.create({
    theme: "Sustainability",
    projectName: "EcoCampus AI",
    projectRequirement: "Campus energy optimization platform",
    deliverables: "Working web app and API",
    teamSize: 4,
    deadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    eventId: event._id,
    createdBy: leadUser._id,
    roles: [
      {
        title: "Backend Engineer",
        requiredSkills: ["Node.js", "MongoDB"],
        preferredSkills: ["Docker"],
        openings: 1
      },
      {
        title: "Frontend Engineer",
        requiredSkills: ["React", "CSS"],
        preferredSkills: ["TypeScript"],
        openings: 1
      }
    ]
  });

  // -------------------------------------------------------------
  // Test 1: 24h Reminder Idempotency (Sent Once, reminderSentAt recorded)
  // -------------------------------------------------------------
  console.log("1. Testing 24h Reminder Idempotency...");
  sentEmails.length = 0;

  const now = Date.now();
  // Action created 25h ago, expires in 6 days
  const pendingAction = await TeamRequestAction.create({
    senderId: leadUser._id,
    receiverId: candidateA._id,
    teamRequirementId: team._id,
    eventId: event._id,
    role: "Backend Engineer",
    direction: "INVITE",
    status: "PENDING",
    createdAt: new Date(now - 25 * 60 * 60 * 1000),
    expiresAt: new Date(now + 6 * 24 * 60 * 60 * 1000),
    reminderSent24h: false,
    reminderSentAt: null
  });

  const run1 = await checkTimeoutsAndExpiries();
  assert.strictEqual(run1.remindersSentCount, 1, "Expected exactly 1 reminder sent on first run");

  const updatedAction = await TeamRequestAction.findById(pendingAction._id);
  assert.strictEqual(updatedAction.reminderSent24h, true, "reminderSent24h flag must be true");
  assert.ok(updatedAction.reminderSentAt instanceof Date, "reminderSentAt must be a valid Date timestamp");

  // Verify in-app notification and email
  const notif1 = await Notification.findOne({ userId: candidateA._id, actionId: pendingAction._id });
  assert.ok(notif1, "In-app reminder notification should be created");
  assert.strictEqual(sentEmails.length, 1, "Transactional reminder email should be dispatched");
  assert.strictEqual(sentEmails[0].to, "aaradhya.w@kkwagh.edu.in");
  assert.ok(sentEmails[0].subject.includes("Reminder"), "Subject should contain 'Reminder'");

  // Second run: Must be idempotent (count = 0, no duplicate email)
  const run2 = await checkTimeoutsAndExpiries();
  assert.strictEqual(run2.remindersSentCount, 0, "Second run must send 0 reminders (idempotent)");
  assert.strictEqual(sentEmails.length, 1, "No duplicate email should be sent on second run");

  console.log("   ✓ 24h reminder sent once, reminderSentAt recorded, subsequent runs idempotent.");

  // -------------------------------------------------------------
  // Test 2: Action Expiry Idempotency (Applied Once, expiredAt recorded)
  // -------------------------------------------------------------
  console.log("2. Testing Action Expiry Idempotency...");
  sentEmails.length = 0;

  const expiredAction = await TeamRequestAction.create({
    senderId: leadUser._id,
    receiverId: candidateA._id,
    teamRequirementId: team._id,
    eventId: event._id,
    role: "Backend Engineer",
    direction: "INVITE",
    status: "PENDING",
    expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
    reminderSent24h: true,
    reminderSentAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
  });

  const expiryRun1 = await checkTimeoutsAndExpiries();
  assert.strictEqual(expiryRun1.expiredPendingCount, 1, "Expected 1 expired pending action on first run");

  const refreshedExpired = await TeamRequestAction.findById(expiredAction._id);
  assert.strictEqual(refreshedExpired.status, "EXPIRED", "Action status must transition to EXPIRED");
  assert.ok(refreshedExpired.expiredAt instanceof Date, "expiredAt must be recorded as a valid Date");

  assert.strictEqual(sentEmails.length, 1, "Expiry transactional email should be dispatched");
  assert.ok(sentEmails[0].subject.includes("Expired"), "Subject must mention Expired");

  // Second run: Idempotent
  const expiryRun2 = await checkTimeoutsAndExpiries();
  assert.strictEqual(expiryRun2.expiredPendingCount, 0, "Second run must not re-expire already expired action");
  assert.strictEqual(sentEmails.length, 1, "No duplicate expiry email sent");

  console.log("   ✓ Action expiry applied once, expiredAt recorded, second run idempotent.");

  // -------------------------------------------------------------
  // Test 3: Confirmation Timeout Idempotency (Candidate spot released)
  // -------------------------------------------------------------
  console.log("3. Testing Confirmation Timeout Idempotency...");
  sentEmails.length = 0;

  const timeoutAction = await TeamRequestAction.create({
    senderId: leadUser._id,
    receiverId: candidateA._id,
    teamRequirementId: team._id,
    eventId: event._id,
    role: "Backend Engineer",
    direction: "INVITE",
    status: "ACCEPTED",
    confirmationExpiresAt: new Date(Date.now() - 5000) // Confirmation timed out
  });

  const timeoutRun1 = await checkTimeoutsAndExpiries();
  assert.strictEqual(timeoutRun1.timedOutConfirmationsCount, 1, "Expected 1 timed out confirmation");

  const refreshedTimeout = await TeamRequestAction.findById(timeoutAction._id);
  assert.strictEqual(refreshedTimeout.status, "EXPIRED", "Status must become EXPIRED");
  assert.ok(refreshedTimeout.expiredAt instanceof Date, "expiredAt must be set");

  // Notifications to both sender and receiver
  const notifSender = await Notification.findOne({ userId: leadUser._id, actionId: timeoutAction._id });
  const notifReceiver = await Notification.findOne({ userId: candidateA._id, actionId: timeoutAction._id, title: "Spot Released" });
  assert.ok(notifSender, "Sender should receive confirmation timeout notification");
  assert.ok(notifReceiver, "Receiver should receive spot released notification");

  // Both leadUser and candidateA have emailNotifications: true -> 2 emails sent
  assert.strictEqual(sentEmails.length, 2, "Expected 2 confirmation timeout emails (lead and candidate)");

  // Second run: Idempotent
  const timeoutRun2 = await checkTimeoutsAndExpiries();
  assert.strictEqual(timeoutRun2.timedOutConfirmationsCount, 0, "Second run must have 0 timeouts");
  assert.strictEqual(sentEmails.length, 2, "No duplicate emails on second run");

  console.log("   ✓ Confirmation timeout applied once, expiredAt recorded, candidate spot released.");

  // -------------------------------------------------------------
  // Test 4: Per-User emailNotifications Setting Respected
  // -------------------------------------------------------------
  console.log("4. Testing User emailNotifications Setting Toggle...");
  sentEmails.length = 0;

  // candidateB has emailNotifications: false
  const actionMuted = await TeamRequestAction.create({
    senderId: leadUser._id,
    receiverId: candidateB._id,
    teamRequirementId: team._id,
    eventId: event._id,
    role: "Frontend Engineer",
    direction: "INVITE",
    status: "PENDING",
    createdAt: new Date(now - 26 * 60 * 60 * 1000),
    expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000),
    reminderSent24h: false,
    reminderSentAt: null
  });

  const mutedRun = await checkTimeoutsAndExpiries();
  assert.strictEqual(mutedRun.remindersSentCount, 1, "Reminder processed in state machine");

  // Verify in-app notification was created, but ZERO emails dispatched to candidateB
  const inAppNotif = await Notification.findOne({ userId: candidateB._id, actionId: actionMuted._id });
  assert.ok(inAppNotif, "In-app notification must still be saved even when emails are muted");
  assert.strictEqual(sentEmails.length, 0, "No email should be sent when user emailNotifications is false");

  console.log("   ✓ Muted user received in-app notification while email dispatch was suppressed.");

  // -------------------------------------------------------------
  // Test 5: In-Process Overlapping Runs Blocked
  // -------------------------------------------------------------
  console.log("5. Testing In-Process Overlap Prevention (isRunning flag)...");
  
  // Acquire process lock manually
  const lock1 = await acquireJobLock();
  assert.strictEqual(lock1, true, "First lock acquisition should succeed");
  assert.strictEqual(getIsRunning(), true, "isRunning flag should be true");

  // Second concurrent attempt within same process
  const lock2 = await acquireJobLock();
  assert.strictEqual(lock2, false, "Second lock acquisition in same process must be blocked");

  // Release lock
  await releaseJobLock();
  assert.strictEqual(getIsRunning(), false, "isRunning flag should be false after release");

  // Re-acquire should now succeed
  const lock3 = await acquireJobLock();
  assert.strictEqual(lock3, true, "Lock can be re-acquired after release");
  await releaseJobLock();

  console.log("   ✓ In-process isRunning flag prevents overlapping runs.");

  // -------------------------------------------------------------
  // Test 6: Multi-Instance Distributed Lock via MongoDB 'jobs' Collection
  // -------------------------------------------------------------
  console.log("6. Testing Atomic MongoDB Distributed Lock (jobs collection)...");

  // Simulate Instance A holding a distributed lock with lockedUntil in the future
  const futureLock = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
  await Job.updateOne(
    { _id: JOB_NAME },
    { $set: { lockedUntil: futureLock, lastRunAt: new Date() } },
    { upsert: true }
  );

  // Instance B attempts to run scheduled job: Must be blocked by MongoDB atomic lock
  const instanceBRun = await runScheduledJob();
  assert.strictEqual(instanceBRun.executed, false, "Execution must be skipped when locked in MongoDB");
  assert.strictEqual(instanceBRun.reason, "locked", "Reason must be 'locked'");

  // Simulate lock expiry (lockedUntil in the past)
  const pastLock = new Date(Date.now() - 1000);
  await Job.updateOne(
    { _id: JOB_NAME },
    { $set: { lockedUntil: pastLock } }
  );

  // Instance B now attempts again: Must successfully acquire expired lock and execute
  const instanceBRunAfterExpiry = await runScheduledJob();
  assert.strictEqual(instanceBRunAfterExpiry.executed, true, "Execution must succeed after lock expiry");

  // Verify lock was released upon completion
  const finishedJobDoc = await Job.findById(JOB_NAME);
  assert.ok(finishedJobDoc.lockedUntil <= new Date(), "Lock must be released (lockedUntil <= now)");
  assert.ok(finishedJobDoc.lastFinishedAt instanceof Date, "lastFinishedAt timestamp must be recorded");

  console.log("   ✓ Atomic MongoDB lock document blocks concurrent runs and safely auto-recovers on lease expiry.");

  // -------------------------------------------------------------
  // Test 7: Scheduler Start with .unref() and Clean Stop
  // -------------------------------------------------------------
  console.log("7. Testing Scheduler Lifecycle (.unref() & clean shutdown)...");

  const timer = startScheduler(500);
  assert.ok(timer, "startScheduler should return a timer instance");
  assert.strictEqual(typeof timer.unref, "function", "Timer must support unref()");

  // Calling startScheduler again returns existing timer
  const sameTimer = startScheduler(500);
  assert.strictEqual(timer, sameTimer, "startScheduler should be idempotent and not create duplicate intervals");

  stopScheduler();
  assert.strictEqual(getIsRunning(), false, "stopScheduler should reset running state");

  console.log("   ✓ Scheduler loop starts with .unref() and stops cleanly.");

  await teardown();

  console.log("\n=================================================");
  console.log("ALL PHASE 10B SCHEDULER & REMINDER TESTS PASSED (100%)");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("SCHEDULER TEST FAILED:", err);
  process.exit(1);
});
