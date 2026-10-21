/**
 * tests/raceAndNegative.test.js
 * 
 * Tests for Part 2:
 * 5c: Race test: two simultaneous confirm requests for the last open role. Exactly one must succeed.
 * 5d: Negative cases: unauthenticated access, forged sender/receiver ID, wrong recipient responding,
 *     invalid state transition, full team.
 */

const assert = require("assert");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const { createAction, acceptAction, confirmAction } = require("../utils/actionStateMachine");

console.log("=================================================");
console.log("RUNNING 5C RACE TEST & 5D NEGATIVE TEST SUITE");
console.log("=================================================\n");

async function runTests() {
  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const hashedPassword = await bcrypt.hash("Password123#", 10);

    const lead = await User.create({
      name: "Lead Dev",
      email: "lead_race@kkwagh.edu.in",
      password: hashedPassword,
      isVerified: true
    });

    const candidate1 = await User.create({
      name: "Candidate One",
      email: "c1_race@kkwagh.edu.in",
      password: hashedPassword,
      isVerified: true
    });

    const candidate2 = await User.create({
      name: "Candidate Two",
      email: "c2_race@kkwagh.edu.in",
      password: hashedPassword,
      isVerified: true
    });

    const candidate3 = await User.create({
      name: "Candidate Three",
      email: "c3_race@kkwagh.edu.in",
      password: hashedPassword,
      isVerified: true
    });

    const event = await Event.create({
      name: "Race Hackathon 2026",
      organizer: "Campus Coding Cell",
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      mode: "Offline",
      minTeamSize: 2,
      maxTeamSize: 4,
      createdBy: lead._id
    });

    // -------------------------------------------------------------
    // 5c. Race test: two simultaneous confirm requests for last open role
    // -------------------------------------------------------------
    console.log("5c. Testing Simultaneous Confirm Race Condition on Last Open Role...");
    const teamReq = await TeamRequirement.create({
      projectName: "Race Condition Project",
      eventId: event._id,
      createdBy: lead._id,
      theme: "Web Development",
      teamSize: 2,
      deliverables: "Working web application",
      projectRequirement: "Build front-end and back-end integration",
      deadline: event.deadline,
      roles: [
        { title: "Frontend Developer", openings: 1, requiredSkills: ["React"] }
      ],
      status: "OPEN"
    });

    // Lead invites candidate 1
    const action1 = await createAction({
      direction: "INVITE",
      teamRequirementId: teamReq._id,
      senderId: lead._id,
      receiverId: candidate1._id,
      role: "Frontend Developer"
    });

    // Lead invites candidate 2
    const action2 = await createAction({
      direction: "INVITE",
      teamRequirementId: teamReq._id,
      senderId: lead._id,
      receiverId: candidate2._id,
      role: "Frontend Developer"
    });

    // Both candidates accept their invites -> status = ACCEPTED
    await acceptAction(action1._id, candidate1._id);
    await acceptAction(action2._id, candidate2._id);

    // Simultaneous confirm requests by lead
    console.log("   Firing simultaneous confirmAction for Candidate 1 and Candidate 2...");
    const results = await Promise.allSettled([
      confirmAction(action1._id, lead._id),
      confirmAction(action2._id, lead._id)
    ]);

    const successes = results.filter(r => r.status === "fulfilled");
    const failures = results.filter(r => r.status === "rejected");

    console.log(`   Simultaneous confirms completed: ${successes.length} succeeded, ${failures.length} rejected.`);
    if (failures.length > 0) {
      console.log(`   Rejection reason: ${failures[0].reason.message}`);
    }

    // Check team requirement role openings in database
    const freshTeam = await TeamRequirement.findById(teamReq._id);
    console.log(`   Remaining openings in DB: ${freshTeam.roles[0].openings}`);

    assert.strictEqual(successes.length, 1, "Exactly one confirm must succeed");
    assert.strictEqual(failures.length, 1, "Exactly one confirm must be rejected");
    assert.strictEqual(freshTeam.roles[0].openings, 0, "Role openings must be exactly 0, not negative");

    // Verify candidate lock states and action statuses
    const freshC1 = await User.findById(candidate1._id);
    const freshC2 = await User.findById(candidate2._id);
    const freshAct1 = await TeamRequestAction.findById(action1._id);
    const freshAct2 = await TeamRequestAction.findById(action2._id);

    const eventLockKey = event._id.toString();
    const c1Locked = freshC1.lockedEvents && freshC1.lockedEvents.includes(eventLockKey);
    const c2Locked = freshC2.lockedEvents && freshC2.lockedEvents.includes(eventLockKey);

    assert.ok((c1Locked && !c2Locked) || (!c1Locked && c2Locked), "Exactly one candidate must be locked into the event");
    
    if (c1Locked) {
      assert.strictEqual(freshAct1.status, "LOCKED", "Winning action must be LOCKED");
      assert.strictEqual(freshAct2.status, "ACCEPTED", "Losing action must remain ACCEPTED");
      assert.strictEqual(c2Locked, false, "Losing candidate must NOT be locked");
    } else {
      assert.strictEqual(freshAct2.status, "LOCKED", "Winning action must be LOCKED");
      assert.strictEqual(freshAct1.status, "ACCEPTED", "Losing action must remain ACCEPTED");
      assert.strictEqual(c1Locked, false, "Losing candidate must NOT be locked");
    }
    console.log("   ✓ 5c Passed: Exactly one confirm succeeded; losing candidate is NOT locked; action remains ACCEPTED; openings = 0.");

    // -------------------------------------------------------------
    // Test: Same action confirmed twice concurrently
    // -------------------------------------------------------------
    console.log("   Testing same action confirmed twice concurrently...");
    const teamReqDup = await TeamRequirement.create({
      projectName: "Duplicate Confirm Test Project",
      eventId: event._id,
      createdBy: lead._id,
      theme: "Cloud Systems",
      teamSize: 2,
      deliverables: "Microservice cluster",
      projectRequirement: "Build containerized service architecture",
      deadline: event.deadline,
      roles: [
        { title: "DevOps Engineer", openings: 1, requiredSkills: ["Docker"] }
      ],
      status: "OPEN"
    });

    const dupCandidate = await User.create({
      name: "DevOps Candidate",
      email: "devops_race@kkwagh.edu.in",
      password: hashedPassword,
      isVerified: true
    });

    const actionDup = await createAction({
      direction: "INVITE",
      teamRequirementId: teamReqDup._id,
      senderId: lead._id,
      receiverId: dupCandidate._id,
      role: "DevOps Engineer"
    });

    await acceptAction(actionDup._id, dupCandidate._id);

    // Concurrently fire confirm on the exact same action ID
    const dupResults = await Promise.allSettled([
      confirmAction(actionDup._id, lead._id),
      confirmAction(actionDup._id, lead._id)
    ]);

    const dupSuccesses = dupResults.filter(r => r.status === "fulfilled");
    const freshDupTeam = await TeamRequirement.findById(teamReqDup._id);
    const freshDupCandidate = await User.findById(dupCandidate._id);
    const freshDupAction = await TeamRequestAction.findById(actionDup._id);

    // Openings must have decremented exactly once to 0, NEVER negative
    assert.strictEqual(freshDupTeam.roles[0].openings, 0, "Role openings must decrement exactly once to 0");
    assert.strictEqual(freshDupAction.status, "LOCKED", "Action must be LOCKED");
    assert.ok(freshDupCandidate.lockedEvents.includes(eventLockKey), "Candidate must be locked for event");
    assert.strictEqual(
      freshDupCandidate.lockedEvents.filter(k => k === eventLockKey).length,
      1,
      "Event must appear in candidate's lockedEvents exactly once"
    );
    console.log("   ✓ Concurrent duplicate confirms on the same action handled safely (openings = 0, no double decrement).");

    // -------------------------------------------------------------
    // 5d. End-to-end negative-case tests
    // -------------------------------------------------------------
    console.log("\n5d. Testing End-to-End Negative Cases...");

    // Case 1: Wrong recipient responding
    console.log("   Case 1: Wrong recipient attempts to accept an invite...");
    const actionWrongRecipient = await createAction({
      direction: "INVITE",
      teamRequirementId: teamReq._id,
      senderId: lead._id,
      receiverId: candidate3._id,
      role: "Frontend Developer"
    });

    let wrongRecipientCaught = false;
    try {
      // Candidate 1 tries to accept Candidate 3's invite
      await acceptAction(actionWrongRecipient._id, candidate1._id);
    } catch (err) {
      wrongRecipientCaught = true;
      assert.ok(
        err.message.includes("Only the designated recipient") || err.message.includes("Unauthorized"),
        `Unexpected error message: ${err.message}`
      );
    }
    assert.strictEqual(wrongRecipientCaught, true, "Wrong recipient acceptance must be rejected.");
    console.log("   ✓ Case 1 passed: Wrong recipient cannot accept another user's invite.");

    // Case 2: Invalid state transition
    console.log("   Case 2: Invalid state transition (confirming a PENDING action)...");
    let invalidTransitionCaught = false;
    try {
      // Action is still PENDING, attempting to confirm directly
      await confirmAction(actionWrongRecipient._id, lead._id);
    } catch (err) {
      invalidTransitionCaught = true;
      assert.ok(
        err.message.includes("must be in ACCEPTED state") || err.message.includes("Cannot confirm action"),
        `Unexpected error message: ${err.message}`
      );
    }
    assert.strictEqual(invalidTransitionCaught, true, "Confirming a PENDING action must be rejected.");
    console.log("   ✓ Case 2 passed: Invalid state transition correctly rejected.");

    // Case 3: Full team / no openings remaining
    console.log("   Case 3: Action confirmation on full team (openings = 0)...");
    // Accept candidate 3's action
    await acceptAction(actionWrongRecipient._id, candidate3._id);

    let fullTeamCaught = false;
    try {
      await confirmAction(actionWrongRecipient._id, lead._id);
    } catch (err) {
      fullTeamCaught = true;
      assert.ok(
        err.message.includes("no openings remaining") || err.message.includes("already closed/full"),
        `Unexpected error message: ${err.message}`
      );
    }
    assert.strictEqual(fullTeamCaught, true, "Confirming when role has 0 openings must be rejected.");
    console.log("   ✓ Case 3 passed: Confirming for full team/zero openings rejected.");

    // Case 4: Forged sender / receiver ID in request
    console.log("   Case 4: Forged unauthorized caller attempting to confirm match...");
    let forgedCallerCaught = false;
    try {
      // Candidate 2 attempts to confirm action (only lead/sender may confirm)
      await confirmAction(actionWrongRecipient._id, candidate2._id);
    } catch (err) {
      forgedCallerCaught = true;
      assert.ok(
        err.message.includes("Only the initiating requester can confirm") || err.message.includes("Unauthorized"),
        `Unexpected error message: ${err.message}`
      );
    }
    assert.strictEqual(forgedCallerCaught, true, "Unauthorized/forged caller confirmation must be rejected.");
    console.log("   ✓ Case 4 passed: Unauthorized/forged caller confirmation rejected.");

    console.log("\n=================================================");
    console.log("ALL 5C AND 5D TESTS COMPLETED SUCCESSFULLY");
    console.log("=================================================");

  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
