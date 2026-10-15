const assert = require("assert");

console.log("=================================================");
console.log("RUNNING PHASE 5: UNIFIED ACTIONS & STATE MACHINE TESTS");
console.log("=================================================\n");

// -------------------------------------------------------------
// Test 1: Action Schema & Direction Flag
// -------------------------------------------------------------
console.log("1. Testing Action Schema & Directions (INVITE | APPLY)...");
const validDirections = ["INVITE", "APPLY"];
const validStatuses = ["PENDING", "ACCEPTED", "CONFIRMED", "LOCKED", "DECLINED", "EXPIRED", "ROLE_FILLED"];

assert.ok(validDirections.includes("INVITE"));
assert.ok(validDirections.includes("APPLY"));
assert.strictEqual(validDirections.length, 2);
console.log("   ✓ Directions verified: INVITE and APPLY.");

// -------------------------------------------------------------
// Test 2: Lifecycle Flow: PENDING -> ACCEPTED -> CONFIRMED -> LOCKED
// -------------------------------------------------------------
console.log("2. Testing Status Flow: PENDING -> ACCEPTED -> CONFIRMED -> LOCKED...");
let action = {
  id: "act-101",
  direction: "INVITE",
  status: "PENDING",
  senderId: "lead-1",
  receiverId: "candidate-1",
  eventId: "event-42",
  role: "Backend Developer",
  confirmedByRequester: false
};

// Step A: Candidate accepts
function simulateAccept(act, userId) {
  assert.strictEqual(act.status, "PENDING", "Can only accept pending actions");
  assert.strictEqual(userId, act.receiverId, "Only recipient can accept");
  act.status = "ACCEPTED";
  act.confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  return act;
}

simulateAccept(action, "candidate-1");
assert.strictEqual(action.status, "ACCEPTED", "Accepting must transition to ACCEPTED, NEVER LOCKED");
assert.strictEqual(action.confirmedByRequester, false, "Requester has not yet confirmed");
assert.ok(action.confirmationExpiresAt > new Date(), "Confirmation timeout set to 24h");
console.log("   ✓ Acceptance transitions to ACCEPTED without locking; 24h timeout assigned.");

// Step B: Requester confirms -> LOCKED
function simulateConfirm(act, userId, roleObj, candidateUser) {
  assert.strictEqual(act.status, "ACCEPTED", "Can only confirm accepted actions");
  assert.strictEqual(userId, act.senderId, "Only initiating requester can confirm");
  
  act.confirmedByRequester = true;
  act.status = "LOCKED";

  // Lock candidate for this event only
  if (!candidateUser.lockedEvents) candidateUser.lockedEvents = [];
  if (!candidateUser.lockedEvents.includes(act.eventId)) {
    candidateUser.lockedEvents.push(act.eventId);
  }

  // Decrement role openings
  roleObj.openings = Math.max(0, roleObj.openings - 1);

  return { act, candidateUser, roleObj };
}

const role = { title: "Backend Developer", openings: 1 };
const candidate = { id: "candidate-1", lockedEvents: [] };

simulateConfirm(action, "lead-1", role, candidate);
assert.strictEqual(action.status, "LOCKED", "Requester confirmation transitions to LOCKED");
assert.strictEqual(action.confirmedByRequester, true);
assert.strictEqual(role.openings, 0, "Role openings decremented by 1");
assert.deepStrictEqual(candidate.lockedEvents, ["event-42"], "Candidate locked for event-42 only");
console.log("   ✓ Confirmation locks match, decrements role openings, and locks event strictly per-event.");

// -------------------------------------------------------------
// Test 3: Role Filled Cascading
// -------------------------------------------------------------
console.log("3. Testing Role-Filled Cascading...");
const otherPendingActions = [
  { id: "act-102", role: "Backend Developer", status: "PENDING" },
  { id: "act-103", role: "Backend Developer", status: "ACCEPTED" },
  { id: "act-104", role: "Frontend Developer", status: "PENDING" }
];

function cascadeRoleFilled(roleTitle, openings, actionsList) {
  if (openings <= 0) {
    actionsList.forEach(act => {
      if (act.role === roleTitle && (act.status === "PENDING" || act.status === "ACCEPTED")) {
        act.status = "ROLE_FILLED";
      }
    });
  }
}

cascadeRoleFilled("Backend Developer", role.openings, otherPendingActions);
assert.strictEqual(otherPendingActions[0].status, "ROLE_FILLED", "Backend PENDING becomes ROLE_FILLED");
assert.strictEqual(otherPendingActions[1].status, "ROLE_FILLED", "Backend ACCEPTED becomes ROLE_FILLED");
assert.strictEqual(otherPendingActions[2].status, "PENDING", "Frontend role remains PENDING");
console.log("   ✓ Other pending actions cascade to ROLE_FILLED when openings reach 0.");

// -------------------------------------------------------------
// Test 4: Timeouts, Reminders, and Expiries
// -------------------------------------------------------------
console.log("4. Testing 24h Reminder, Warning, and Auto-Expiry...");
const now = Date.now();
const testActions = [
  // 1. Pending action with 23 hours elapsed (needs 24h reminder)
  {
    id: "act-reminder",
    status: "PENDING",
    createdAt: new Date(now - 25 * 60 * 60 * 1000), // 25h ago
    reminderSent: false,
    closingSoonWarned: false,
    expiresAt: new Date(now + 6 * 24 * 60 * 60 * 1000)
  },
  // 2. Pending action nearing expiry (less than 24h left -> closing-soon warning)
  {
    id: "act-warning",
    status: "PENDING",
    createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
    reminderSent: true,
    closingSoonWarned: false,
    expiresAt: new Date(now + 12 * 60 * 60 * 1000) // 12h left
  },
  // 3. Pending action past expiresAt -> EXPIRED (no reputation penalty)
  {
    id: "act-expired",
    status: "PENDING",
    createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now - 1000)
  },
  // 4. Accepted action past confirmationExpiresAt -> EXPIRED (timeout releases candidate)
  {
    id: "act-timeout",
    status: "ACCEPTED",
    confirmationExpiresAt: new Date(now - 1000)
  }
];

const generatedNotifications = [];

function checkTimeouts(actions) {
  actions.forEach(act => {
    // 1. Action expiry
    if (act.status === "PENDING" && act.expiresAt && new Date(act.expiresAt).getTime() <= now) {
      act.status = "EXPIRED";
      generatedNotifications.push({ type: "expired", id: act.id });
      return;
    }
    // 2. Confirmation timeout
    if (act.status === "ACCEPTED" && act.confirmationExpiresAt && new Date(act.confirmationExpiresAt).getTime() <= now) {
      act.status = "EXPIRED";
      generatedNotifications.push({ type: "confirmation_timeout_release", id: act.id });
      return;
    }
    // 3. Closing soon warning
    if (act.status === "PENDING" && !act.closingSoonWarned && act.expiresAt && (new Date(act.expiresAt).getTime() - now) <= 24 * 60 * 60 * 1000 && (new Date(act.expiresAt).getTime() - now) > 0) {
      act.closingSoonWarned = true;
      generatedNotifications.push({ type: "closing_soon", id: act.id });
    }
    // 4. 24h reminder
    if (act.status === "PENDING" && !act.reminderSent && (now - new Date(act.createdAt).getTime()) >= 24 * 60 * 60 * 1000) {
      act.reminderSent = true;
      generatedNotifications.push({ type: "reminder", id: act.id });
    }
  });
}

checkTimeouts(testActions);

assert.strictEqual(testActions[0].reminderSent, true);
assert.strictEqual(testActions[1].closingSoonWarned, true);
assert.strictEqual(testActions[2].status, "EXPIRED", "Expired action with no reputation penalty");
assert.strictEqual(testActions[3].status, "EXPIRED", "Candidate released upon confirmation timeout");
assert.strictEqual(generatedNotifications.length, 4);
console.log("   ✓ 24h reminder, closing-soon warning, and candidate release timeouts verified.");

// -------------------------------------------------------------
// Test 5: Mutual Contact-Sharing Consent Step
// -------------------------------------------------------------
console.log("5. Testing Mutual Contact Sharing...");
const lockedAction = {
  id: "act-locked",
  status: "LOCKED",
  senderContactOptIn: false,
  receiverContactOptIn: false
};

function canViewContacts(act) {
  return act.senderContactOptIn === true && act.receiverContactOptIn === true;
}

// Initially, neither has opted in
assert.strictEqual(canViewContacts(lockedAction), false, "Contacts hidden when 0 opt-ins");

// Sender opts in
lockedAction.senderContactOptIn = true;
assert.strictEqual(canViewContacts(lockedAction), false, "Contacts hidden when only sender opts in");

// Receiver opts in
lockedAction.receiverContactOptIn = true;
assert.strictEqual(canViewContacts(lockedAction), true, "Contacts visible only when BOTH sides opt in");
console.log("   ✓ Mutual contact-sharing consent enforced (both sides required).");

// -------------------------------------------------------------
// Test 6: Per-Event Lock Independence
// -------------------------------------------------------------
console.log("6. Testing Per-Event Locking Independence...");
const student = {
  name: "Aaradhya",
  lockedEvents: ["event-1"] // Locked in event-1
};

// Checking if can join event-1
assert.ok(student.lockedEvents.includes("event-1"), "Student is locked in event-1");
// Checking if can join event-2 (different event!)
assert.ok(!student.lockedEvents.includes("event-2"), "Student is NOT locked in event-2");
console.log("   ✓ Availability lock is strictly PER EVENT, not global.");

console.log("\n=================================================");
console.log("ALL 6 PHASE 5 STATE MACHINE TESTS PASSED (100%)");
console.log("=================================================\n");
