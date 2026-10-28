const assert = require("assert");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../models/User");
const Notification = require("../models/Notification");
const {
  sendNotification,
  flushAllNotificationBatches,
  getPendingNotificationBatches
} = require("../utils/actionStateMachine");
const { setMockTransporter } = require("../utils/mailer");
const { computeLeaderboard } = require("../utils/leaderboardService");
const { getRecommendedCandidates } = require("../utils/recommendations");
const TeamRequirement = require("../models/TeamRequirement");

console.log("=================================================");
console.log("RUNNING PHASE 10E: SMALL GAPS & POLISH TESTS");
console.log("=================================================\n");

let mongod;

async function runTests() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const sentEmails = [];
  setMockTransporter({
    sendMail: async (mailOpts) => {
      sentEmails.push(mailOpts);
      return { messageId: `msg-${Date.now()}` };
    }
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Notifications - Email Batching (5 min) & Preference Check
    // -------------------------------------------------------------
    console.log("1. Testing Notification Email Dispatch & 5-Minute Batching...");
    const studentA = await User.create({
      name: "Student Alpha",
      email: "alpha@kkwagh.edu.in",
      password: "HashedPassword123",
      emailNotifications: true
    });

    const studentMuted = await User.create({
      name: "Student Muted",
      email: "muted@kkwagh.edu.in",
      password: "HashedPassword123",
      emailNotifications: false
    });

    sentEmails.length = 0;

    // Send single notification to Student A
    await sendNotification(studentA._id, "Team Invitation", "You were invited to ByteCraft", "invite", null, "/invites");
    assert.strictEqual(sentEmails.length, 0, "Email must be queued into 5-minute batch, not sent instantly");

    const batches = getPendingNotificationBatches();
    assert.ok(batches.has(studentA._id.toString()), "Pending batch must exist for studentA");
    assert.strictEqual(batches.get(studentA._id.toString()).notifications.length, 1);

    // Send second notification to Student A within the 5-minute window
    await sendNotification(studentA._id, "Match Accepted", "Your application was accepted", "success", null, "/notifications");
    assert.strictEqual(batches.get(studentA._id.toString()).notifications.length, 2, "Second notification must be batched together");

    // Send notification to Muted student
    await sendNotification(studentMuted._id, "Alert", "Muted update", "info", null, "/notifications");
    assert.ok(!batches.has(studentMuted._id.toString()), "Muted user with emailNotifications:false must not be queued");

    // Flush batches
    await flushAllNotificationBatches();
    assert.strictEqual(sentEmails.length, 1, "Exactly one batched digest email should be sent to Student A");
    assert.strictEqual(sentEmails[0].to, "alpha@kkwagh.edu.in");
    assert.ok(sentEmails[0].subject.includes("2 new updates"), "Subject reflects batched count");
    assert.ok(sentEmails[0].html.includes("Team Invitation"), "Contains first notification title");
    assert.ok(sentEmails[0].html.includes("Match Accepted"), "Contains second notification title");
    assert.ok(sentEmails[0].html.includes("/notifications"), "Direct link to notifications included");
    assert.ok(!sentEmails[0].html.includes("phone"), "Zero contact details exposed");
    console.log("   ✓ Notifications batching, user preference check, and direct link verified.");

    // -------------------------------------------------------------
    // Test 2: Unread Count & Mark All Read
    // -------------------------------------------------------------
    console.log("2. Testing Unread Count & Mark All Read...");
    const unreadCount = await Notification.countDocuments({ userId: studentA._id, read: false });
    assert.strictEqual(unreadCount, 2, "Student A has 2 unread notifications");

    await Notification.updateMany({ userId: studentA._id, read: false }, { $set: { read: true } });
    const afterCount = await Notification.countDocuments({ userId: studentA._id, read: false });
    assert.strictEqual(afterCount, 0, "Mark all as read sets unread count to 0");
    console.log("   ✓ Unread count and mark-read mutation verified.");

    // -------------------------------------------------------------
    // Test 3: Friendly 404 & 500 Pages & Flash Alerts
    // -------------------------------------------------------------
    console.log("3. Testing 404 and 500 Views & Flash Templates...");
    const rootDir = path.join(__dirname, "..");
    const v404 = fs.readFileSync(path.join(rootDir, "views", "404.ejs"), "utf8");
    const v500 = fs.readFileSync(path.join(rootDir, "views", "500.ejs"), "utf8");
    assert.ok(v404.includes("404 — Page Not Found"), "404 view contains Page Not Found header");
    assert.ok(v404.includes('href="/"'), "404 view contains link home");
    assert.ok(v500.includes("500 — Server Error"), "500 view contains Server Error header");
    assert.ok(v500.includes('href="/"'), "500 view contains link home");

    const boilerplate = fs.readFileSync(path.join(rootDir, "views", "layouts", "boilerplate.ejs"), "utf8");
    assert.ok(boilerplate.includes("flash-success"), "Boilerplate renders success flash messages");
    assert.ok(boilerplate.includes("flash-danger"), "Boilerplate renders error flash messages");
    console.log("   ✓ 404 and 500 templates and flash message support verified.");

    // -------------------------------------------------------------
    // Test 4: Profile Completeness Bar & Missing Fields
    // -------------------------------------------------------------
    console.log("4. Testing Profile Completeness & Missing Fields...");
    const studentIncomplete = new User({
      name: "Incomplete User",
      email: "incomplete@kkwagh.edu.in",
      password: "Password123"
    });
    // Name + Email = 20%
    assert.strictEqual(studentIncomplete.completenessPercentage, 20);
    const missing = studentIncomplete.missingFields;
    assert.ok(missing.some(m => m.includes("Department")), "Missing Department reported");
    assert.ok(missing.some(m => m.includes("Bio")), "Missing Bio reported");
    assert.ok(missing.some(m => m.includes("skills")), "Missing skills reported");
    assert.ok(missing.some(m => m.includes("link")), "Missing external link reported");
    assert.ok(missing.some(m => m.includes("project")), "Missing projects reported");

    // Fill all fields -> 100%
    studentIncomplete.department = "Computer Engineering";
    studentIncomplete.year = "Third Year";
    studentIncomplete.bio = "Experienced full-stack engineer building AI solutions.";
    studentIncomplete.skills = [
      { name: "Node.js", level: 4 },
      { name: "React", level: 4 },
      { name: "MongoDB", level: 4 }
    ];
    studentIncomplete.github = "https://github.com/incomplete";
    studentIncomplete.projects = [{ title: "TeamForge", description: "Hackathon teaming app" }];

    assert.strictEqual(studentIncomplete.completenessPercentage, 100);
    assert.strictEqual(studentIncomplete.missingFields.length, 0);
    console.log("   ✓ Profile completeness calculation and missing fields list verified.");

    // -------------------------------------------------------------
    // Test 5: Hide Profile Removes from Leaderboard & Candidate Discovery
    // -------------------------------------------------------------
    console.log("5. Testing 'Hide My Profile' Removal from Leaderboard & Search...");
    const hiddenStudent = await User.create({
      name: "Hidden Student",
      email: "hidden@kkwagh.edu.in",
      password: "Password123",
      isProfileHidden: true,
      skills: [{ name: "Python", level: 5 }]
    });

    const leaderboard = await computeLeaderboard();
    const foundOnBoard = leaderboard.some(entry => entry.user._id.toString() === hiddenStudent._id.toString());
    assert.strictEqual(foundOnBoard, false, "Hidden student must NOT appear on the leaderboard");

    const mockTeam = await TeamRequirement.create({
      projectName: "CyberDefense",
      projectRequirement: "Develop network security tools",
      deliverables: "Working intrusion detection prototype",
      teamSize: 4,
      theme: "Security",
      deadline: new Date(Date.now() + 86400000),
      createdBy: studentA._id,
      roles: [{ title: "Python Dev", openings: 1, requiredSkills: ["Python"] }]
    });

    const candidates = await getRecommendedCandidates(mockTeam, mockTeam.roles[0], studentA._id);
    const foundInCandidates = candidates.some(c => c.user._id.toString() === hiddenStudent._id.toString());
    assert.strictEqual(foundInCandidates, false, "Hidden student must NOT appear in candidate recommendations");
    console.log("   ✓ Hidden profile strictly excluded from leaderboard and candidate search.");

    // -------------------------------------------------------------
    // Test 6: In-App How TeamForge Works Page & Problem Report In-App Form Link
    // -------------------------------------------------------------
    console.log("6. Testing 'How TeamForge Works' Page & Footer Problem Report Link...");
    const ejs = require("ejs");
    const howItWorks = fs.readFileSync(path.join(rootDir, "views", "how-it-works.ejs"), "utf8");
    assert.ok(howItWorks.includes("Sign Up & Build Profile"), "Step 1 present");
    assert.ok(howItWorks.includes("Post Roles or Discover"), "Step 2 present");
    assert.ok(howItWorks.includes("Mutual 24-Hour Match"), "Step 3 present");
    assert.ok(howItWorks.includes("Lock & Double-Blind Review"), "Step 4 present");

    const footerTemplate = fs.readFileSync(path.join(rootDir, "views", "includes", "footer.ejs"), "utf8");
    assert.ok(footerTemplate.includes('href="/how-it-works"'), "Footer links to /how-it-works");
    assert.strictEqual(footerTemplate.includes("support@teamforge.kkwagh.edu.in"), false, "No hardcoded email address in footer template");

    // Test footer rendering with in-app problem report link
    const renderedFooter = ejs.render(footerTemplate, { supportEmail: "custom-support@example.edu.in" });
    assert.ok(renderedFooter.includes('href="/feedback?type=problem"'), "Report link points to /feedback?type=problem");
    assert.strictEqual(renderedFooter.includes("mailto:"), false, "No mailto link rendered in footer");

    console.log("   ✓ In-app 4-step workflow page and in-app problem report link verified.");

    console.log("\n=================================================");
    console.log("ALL PHASE 10E TESTS PASSED (100%)");
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

runTests();
