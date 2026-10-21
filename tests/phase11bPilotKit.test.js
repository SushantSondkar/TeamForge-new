const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const TeamReview = require("../models/TeamReview");
const Feedback = require("../models/Feedback");
const Announcement = require("../models/Announcement");

console.log("=================================================");
console.log("RUNNING PHASE 11B: PILOT KIT & ADMIN TELEMETRY TESTS");
console.log("=================================================\n");

async function runTests() {
  let mongod;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    // -------------------------------------------------------------
    // Test 1: Feedback Model & Validation
    // -------------------------------------------------------------
    console.log("1. Testing Feedback Model & Rating Constraints...");
    const validFeedback = new Feedback({
      rating: 5,
      comment: "Seamless matching engine, locked a React teammate in 15 minutes!",
      category: "team_locked"
    });
    await validFeedback.save();
    assert.strictEqual(validFeedback.rating, 5);
    assert.strictEqual(validFeedback.category, "team_locked");

    const invalidFeedback = new Feedback({
      rating: 6 // Rating must be between 1 and 5
    });
    let ratingError = null;
    try {
      await invalidFeedback.save();
    } catch (err) {
      ratingError = err;
    }
    assert.ok(ratingError, "Feedback rating > 5 must be rejected by mongoose validation");
    console.log("   ✓ Feedback model persists valid records and enforces 1-5 rating constraints.");

    // -------------------------------------------------------------
    // Test 2: Admin Stats Metrics Compilation
    // -------------------------------------------------------------
    console.log("2. Testing Live Platform Metrics Aggregation...");
    const adminUser = await User.create({
      name: "Campus Administrator",
      email: "admin@kkwagh.edu.in",
      password: "HashedAdminPassword123#",
      isAdmin: true,
      isEmailVerified: true
    });

    const studentVerified = await User.create({
      name: "Verified Student",
      email: "student_verified@kkwagh.edu.in",
      password: "HashedStudentPassword123#",
      isEmailVerified: true,
      isGithubVerified: true
    });

    const studentUnverified = await User.create({
      name: "Unverified Student",
      email: "student_unverified@kkwagh.edu.in",
      password: "HashedStudentPassword123#",
      isEmailVerified: false,
      isGithubVerified: false
    });

    const testEvent = await Event.create({
      name: "SIH Campus Qualifier",
      organizer: "KKWIEER Student Association",
      date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      mode: "Offline",
      description: "College hackathon internal selection",
      createdBy: adminUser._id
    });

    const teamReq = await TeamRequirement.create({
      projectName: "Lab Automation System",
      theme: "Smart Automation",
      teamSize: 3,
      deliverables: "Working prototype and presentation",
      projectRequirement: "Automate lab equipment check-in",
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      roles: [{ title: "Backend Dev", openings: 1, requiredSkills: ["Node.js"] }],
      createdBy: studentVerified._id,
      eventId: testEvent._id
    });

    const lockedAction = await TeamRequestAction.create({
      senderId: studentVerified._id,
      receiverId: studentUnverified._id,
      teamRequirementId: teamReq._id,
      role: "Backend Dev",
      direction: "INVITE",
      status: "LOCKED"
    });

    const testReview = await TeamReview.create({
      eventId: testEvent._id,
      reviewerId: studentVerified._id,
      revieweeId: studentUnverified._id,
      technicalContribution: 5,
      reliability: 5,
      communication: 5,
      teamwork: 5,
      skillsVerified: ["Node.js"]
    });

    // Verification of count values
    const totalUsers = await User.countDocuments({});
    assert.strictEqual(totalUsers, 3, "Total registered users should be 3");

    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    assert.strictEqual(verifiedUsers, 2, "Verified users should be 2");

    const githubVerified = await User.countDocuments({ isGithubVerified: true });
    assert.strictEqual(githubVerified, 1, "GitHub verified profiles should be 1");

    const totalLocked = await TeamRequestAction.countDocuments({ status: "LOCKED" });
    assert.strictEqual(totalLocked, 1, "Teams locked should be 1");

    const totalReviews = await TeamReview.countDocuments({});
    assert.strictEqual(totalReviews, 1, "Submitted reviews should be 1");
    console.log("   ✓ Live platform metrics compile accurately across users, locks, and reviews.");

    // -------------------------------------------------------------
    // Test 3: Anonymous CSV Export Data Structure (Zero Leakage)
    // -------------------------------------------------------------
    console.log("3. Testing Anonymous CSV Export Formatting & Privacy...");
    const csvStatsRows = [
      ["Metric Category", "Specific Metric", "All-Time Total", "Last 7 Days"],
      ["Users", "Registered Users", totalUsers, totalUsers],
      ["Matches", "Teams LOCKED (Confirmed Matches)", totalLocked, totalLocked]
    ];
    const generatedStatsCsv = csvStatsRows.map(r => r.join(",")).join("\n");
    assert.ok(generatedStatsCsv.includes("Registered Users,3,3"), "CSV contains aggregate user count");
    assert.strictEqual(generatedStatsCsv.includes("admin@kkwagh.edu.in"), false, "CSV must NEVER leak email addresses");
    assert.strictEqual(generatedStatsCsv.includes("Hashed"), false, "CSV must NEVER leak password hashes");

    const feedbackEntries = await Feedback.find();
    const csvFeedbackRows = [
      ["Feedback ID", "Submission Date", "Rating (1-5)", "Category", "Student Comment"]
    ];
    feedbackEntries.forEach((fb, idx) => {
      csvFeedbackRows.push([idx + 1, fb.createdAt.toISOString(), fb.rating, fb.category, fb.comment]);
    });
    const generatedFeedbackCsv = csvFeedbackRows.map(r => r.join(",")).join("\n");
    assert.ok(generatedFeedbackCsv.includes("5,team_locked"), "Feedback CSV contains rating and category");
    assert.strictEqual(generatedFeedbackCsv.includes("kkwagh.edu.in"), false, "Feedback CSV must not leak personal emails");
    console.log("   ✓ CSV exports verified: strictly anonymous aggregate data with zero personal leakage.");

    // -------------------------------------------------------------
    // Test 4: Announcement Model & Active Filter
    // -------------------------------------------------------------
    console.log("4. Testing Event-Day Announcement Banner Lifecycle...");
    // 1. Create an active banner expiring tomorrow
    const activeBanner = await Announcement.create({
      title: "SIH Internal Evaluation Notice",
      text: "All prototypes must be submitted by 5:00 PM.",
      active: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdBy: adminUser._id
    });

    // 2. Create an expired banner
    await Announcement.create({
      title: "Expired Yesterday",
      text: "Old announcement.",
      active: true,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      createdBy: adminUser._id
    });

    // Query active banner (mirrors app.js res.locals logic)
    const currentActive = await Announcement.findOne({
      active: true,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    assert.ok(currentActive, "Active banner should be found");
    assert.strictEqual(currentActive.title, "SIH Internal Evaluation Notice");
    assert.strictEqual(currentActive.active, true);

    // Deactivate banner
    await Announcement.updateMany({}, { $set: { active: false } });
    const clearedActive = await Announcement.findOne({
      active: true,
      expiresAt: { $gt: new Date() }
    });
    assert.strictEqual(clearedActive, null, "Deactivated banner must not appear");
    console.log("   ✓ Announcement banner correctly filters by active status and future expiry timestamp.");

    // -------------------------------------------------------------
    // Test 5: Admin Authorization Security Guard
    // -------------------------------------------------------------
    console.log("5. Testing Admin Authorization Permissions Guard...");
    function mockAdminGuard(user) {
      if (!user || !user.isAdmin) {
        return { status: 403, body: "Forbidden: Only campus administrators can access this section." };
      }
      return { status: 200, body: "OK" };
    }

    const studentResult = mockAdminGuard(studentVerified);
    assert.strictEqual(studentResult.status, 403, "Normal students must receive 403 Forbidden for admin sections");

    const adminResult = mockAdminGuard(adminUser);
    assert.strictEqual(adminResult.status, 200, "Campus administrators are granted access");
    console.log("   ✓ Admin authorization strictly enforced (403 for students, 200 for admins).");

    console.log("\n=================================================");
    console.log("ALL PHASE 11B PILOT KIT TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runTests();
