/**
 * TEAMFORGE PHASE 10A: DISCOVER SEARCH & CANDIDATE FILTERS TEST SUITE
 * 
 * Verifies:
 * 1. Regex special character escaping (prevents injection / crashes on '.*', '(', '[', etc.).
 * 2. Search query (q) matches across projectName, theme, role title, and required/preferred skills.
 * 3. Individual and combined filters (q, skill, role, event) combine correctly (AND logic).
 * 4. Open requirement gating: requirements without open roles or with past deadlines are excluded.
 * 5. Current user's own teams are never returned in search results.
 * 6. Teams for events where the current user is locked are strictly excluded.
 * 7. Paging: 10 per page with accurate totalCount, totalPages, and navigation flags.
 * 8. Candidate search on team requirement: searches by skill name and minimum level.
 * 9. Hidden profiles (isProfileHidden: true) and locked candidates NEVER appear in candidate search.
 * 10. Dynamic filter extraction: getAvailableFilterOptions returns real skills and roles from open requirements.
 */

const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const {
  escapeRegex,
  searchTeamRequirements,
  getRecommendedCandidates,
  getAvailableFilterOptions
} = require("../utils/recommendations");

let mongod = null;

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri() + "teamforge_search_test";
  await mongoose.connect(uri);
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
}

async function teardown() {
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
  console.log("RUNNING PHASE 10A DISCOVER SEARCH TESTS");
  console.log("=================================================");

  await setup();

  try {
    const hashedPassword = await bcrypt.hash("TestPass123!", 10);
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    // -------------------------------------------------------------
    // TEST 1: Regex Escaping & Special Character Safety
    // -------------------------------------------------------------
    console.log("\n1. Testing Regex Escaping & Special Characters...");

    assert.strictEqual(escapeRegex(".*"), "\\.\\*");
    assert.strictEqual(escapeRegex("("), "\\(");
    assert.strictEqual(escapeRegex("[test]"), "\\[test\\]");
    assert.strictEqual(escapeRegex("a+b*c?"), "a\\+b\\*c\\?");
    assert.strictEqual(escapeRegex(null), "");
    assert.strictEqual(escapeRegex(undefined), "");
    assert.strictEqual(escapeRegex(123), "");

    // Verify regex constructor does not throw or crash with escaped malicious inputs
    const dangerousInputs = [".*", "(", "(((", "[a-z]", "a{100000}", "\\", "+", "?", "$", "^"];
    for (const input of dangerousInputs) {
      assert.doesNotThrow(() => {
        const safe = new RegExp(escapeRegex(input), "i");
        safe.test("sample text");
      }, `Input '${input}' should be safely escaped without throwing regex syntax errors.`);
    }
    console.log("   ✓ Regex special characters are properly escaped and safe from injection.");

    // -------------------------------------------------------------
    // TEST FIXTURES SETUP
    // -------------------------------------------------------------
    console.log("\n2. Setting up users, events, and open team requirements...");

    const studentMe = await User.create({
      name: "Logged-In Student",
      email: "me@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      skills: [{ name: "React", level: 4 }, { name: "Node.js", level: 4 }],
      isEmailVerified: true
    });

    const otherLeadA = await User.create({
      name: "Lead Alpha",
      email: "alpha@kkwagh.edu.in",
      password: hashedPassword,
      department: "Information Technology",
      year: "BE",
      isEmailVerified: true
    });

    const otherLeadB = await User.create({
      name: "Lead Beta",
      email: "beta@kkwagh.edu.in",
      password: hashedPassword,
      department: "AI & Data Science",
      year: "TE",
      isEmailVerified: true
    });

    const eventHackathon = await Event.create({
      name: "EQUINOX 2026",
      organizer: "Computer Dept",
      date: futureDate,
      deadline: futureDate
    });

    const eventRobotics = await Event.create({
      name: "BOT-RACE 2026",
      organizer: "Robotics Club",
      date: futureDate,
      deadline: futureDate
    });

    const eventExpired = await Event.create({
      name: "OLD HACKATHON 2025",
      organizer: "Past Club",
      date: pastDate,
      deadline: pastDate
    });

    // Requirement 1: Owned by Lead Alpha, for EQUINOX, needs React
    const team1 = await TeamRequirement.create({
      theme: "Web Development",
      projectName: "Campus Connect Portal",
      projectRequirement: "Build social networking for students",
      deliverables: "Working web app",
      teamSize: 4,
      deadline: futureDate,
      eventId: eventHackathon._id,
      createdBy: otherLeadA._id,
      roles: [{
        title: "Frontend Engineer",
        requiredSkills: ["React", "CSS"],
        preferredSkills: ["TypeScript"],
        openings: 2
      }]
    });

    // Requirement 2: Owned by Lead Alpha, for BOT-RACE, needs Python & ROS
    const team2 = await TeamRequirement.create({
      theme: "Robotics",
      projectName: "Autonomous Rover System",
      projectRequirement: "Self driving maze runner bot",
      deliverables: "Embedded firmware & controller",
      teamSize: 3,
      deadline: futureDate,
      eventId: eventRobotics._id,
      createdBy: otherLeadA._id,
      roles: [{
        title: "Firmware Developer",
        requiredSkills: ["Python", "C++"],
        preferredSkills: ["ROS"],
        openings: 1
      }]
    });

    // Requirement 3: Owned by Lead Beta, for EQUINOX, needs Machine Learning & Python
    const team3 = await TeamRequirement.create({
      theme: "AI / ML",
      projectName: "Smart Crop Disease Detector",
      projectRequirement: "Computer vision for agricultural leaves",
      deliverables: "Trained PyTorch model and REST API",
      teamSize: 4,
      deadline: futureDate,
      eventId: eventHackathon._id,
      createdBy: otherLeadB._id,
      roles: [{
        title: "ML Researcher",
        requiredSkills: ["Python", "PyTorch"],
        preferredSkills: ["FastAPI"],
        openings: 1
      }]
    });

    // Requirement 4: Owned by studentMe (current user) -> Must NEVER appear in search
    const teamMyOwn = await TeamRequirement.create({
      theme: "Cybersecurity",
      projectName: "My Personal Team Project",
      projectRequirement: "Vulnerability scanner",
      deliverables: "CLI tool",
      teamSize: 2,
      deadline: futureDate,
      eventId: eventHackathon._id,
      createdBy: studentMe._id,
      roles: [{
        title: "Security Analyst",
        requiredSkills: ["Python"],
        openings: 1
      }]
    });

    // Requirement 5: Closed requirement (openings = 0) -> Must NEVER appear in search
    const teamClosed = await TeamRequirement.create({
      theme: "Design",
      projectName: "Fully Staffed Team",
      projectRequirement: "Already complete team",
      deliverables: "Design files",
      teamSize: 2,
      deadline: futureDate,
      eventId: eventHackathon._id,
      createdBy: otherLeadB._id,
      roles: [{
        title: "UI Designer",
        requiredSkills: ["Figma"],
        openings: 0
      }]
    });

    // Requirement 6: Past deadline requirement -> Must NEVER appear in search
    const teamExpired = await TeamRequirement.create({
      theme: "Past Theme",
      projectName: "Expired Team Requirement",
      projectRequirement: "Past event",
      deliverables: "None",
      teamSize: 2,
      deadline: pastDate,
      eventId: eventExpired._id,
      createdBy: otherLeadB._id,
      roles: [{
        title: "Old Role",
        requiredSkills: ["React"],
        openings: 1
      }]
    });

    console.log("   ✓ Test fixture environment created successfully.");

    // -------------------------------------------------------------
    // TEST 2: Base Search Exclusions (Own Teams, Expired, Closed)
    // -------------------------------------------------------------
    console.log("\n3. Testing Base Exclusions (User's own teams, past deadlines, closed roles)...");

    const baseSearch = await searchTeamRequirements({
      currentUser: studentMe,
      q: "",
      page: 1,
      limit: 10
    });

    // Expecting 3 open teams: team1, team2, team3
    assert.strictEqual(baseSearch.totalCount, 3, "Only open, unexpired, non-self requirements should be returned");
    const resultIds = baseSearch.results.map(r => r.team._id.toString());
    assert.ok(resultIds.includes(team1._id.toString()), "team1 should be returned");
    assert.ok(resultIds.includes(team2._id.toString()), "team2 should be returned");
    assert.ok(resultIds.includes(team3._id.toString()), "team3 should be returned");
    assert.strictEqual(resultIds.includes(teamMyOwn._id.toString()), false, "Current user's own team must NEVER appear");
    assert.strictEqual(resultIds.includes(teamClosed._id.toString()), false, "Closed team (0 openings) must NEVER appear");
    assert.strictEqual(resultIds.includes(teamExpired._id.toString()), false, "Expired team must NEVER appear");
    console.log("   ✓ Base exclusions correctly enforce open roles, future deadlines, and exclude user's own teams.");

    // -------------------------------------------------------------
    // TEST 3: Text Search Query (q)
    // -------------------------------------------------------------
    console.log("\n4. Testing Text Query Matching (projectName, theme, role, skills)...");

    // Match by projectName
    const searchByProject = await searchTeamRequirements({
      currentUser: studentMe,
      q: "Autonomous Rover"
    });
    assert.strictEqual(searchByProject.totalCount, 1);
    assert.strictEqual(searchByProject.results[0].team.projectName, "Autonomous Rover System");

    // Match by theme
    const searchByTheme = await searchTeamRequirements({
      currentUser: studentMe,
      q: "Robotics"
    });
    assert.strictEqual(searchByTheme.totalCount, 1);
    assert.strictEqual(searchByTheme.results[0].team.projectName, "Autonomous Rover System");

    // Match by role title
    const searchByRoleTitle = await searchTeamRequirements({
      currentUser: studentMe,
      q: "ML Researcher"
    });
    assert.strictEqual(searchByRoleTitle.totalCount, 1);
    assert.strictEqual(searchByRoleTitle.results[0].team.projectName, "Smart Crop Disease Detector");

    // Match by skill name (PyTorch)
    const searchBySkillText = await searchTeamRequirements({
      currentUser: studentMe,
      q: "PyTorch"
    });
    assert.strictEqual(searchBySkillText.totalCount, 1);
    assert.strictEqual(searchBySkillText.results[0].team.projectName, "Smart Crop Disease Detector");

    // Dangerous characters in query must not crash
    const searchSpecialChars = await searchTeamRequirements({
      currentUser: studentMe,
      q: ".*"
    });
    assert.strictEqual(searchSpecialChars.totalCount, 0, "Query '.*' should literally match nothing, not everything");

    const searchOpenParen = await searchTeamRequirements({
      currentUser: studentMe,
      q: "("
    });
    assert.strictEqual(searchOpenParen.totalCount, 0, "Query '(' must not throw regex error");
    console.log("   ✓ Text search matches project, theme, role, and skills safely with regex escaping.");

    // -------------------------------------------------------------
    // TEST 4: Skill, Event, and Combined Filters
    // -------------------------------------------------------------
    console.log("\n5. Testing Skill, Event, and Combined Filters...");

    // Filter by skill: Python (team2 and team3)
    const searchSkillPython = await searchTeamRequirements({
      currentUser: studentMe,
      skill: "Python"
    });
    assert.strictEqual(searchSkillPython.totalCount, 2);

    // Filter by event: EQUINOX (team1 and team3)
    const searchEventEquinox = await searchTeamRequirements({
      currentUser: studentMe,
      event: eventHackathon._id.toString()
    });
    assert.strictEqual(searchEventEquinox.totalCount, 2);

    // Combined filter: skill Python AND event EQUINOX -> Only team3!
    const searchCombined = await searchTeamRequirements({
      currentUser: studentMe,
      skill: "Python",
      event: eventHackathon._id.toString()
    });
    assert.strictEqual(searchCombined.totalCount, 1);
    assert.strictEqual(searchCombined.results[0].team.projectName, "Smart Crop Disease Detector");
    console.log("   ✓ Individual and combined filters apply correct AND conjunction.");

    // -------------------------------------------------------------
    // TEST 5: Event Locking Exclusion
    // -------------------------------------------------------------
    console.log("\n6. Testing Event Locking Exclusion...");

    // Lock studentMe into eventRobotics
    studentMe.lockedEvents = [eventRobotics._id.toString()];
    await studentMe.save();

    const searchAfterLock = await searchTeamRequirements({
      currentUser: studentMe
    });
    // team2 was for eventRobotics -> must be excluded now!
    const afterLockIds = searchAfterLock.results.map(r => r.team._id.toString());
    assert.strictEqual(afterLockIds.includes(team2._id.toString()), false, "Locked event requirement must be excluded");
    assert.strictEqual(searchAfterLock.totalCount, 2);

    // Clean up lock
    studentMe.lockedEvents = [];
    await studentMe.save();
    console.log("   ✓ Requirements for events where user is locked are strictly excluded.");

    // -------------------------------------------------------------
    // TEST 6: MatchScore Calculation & Breakdown in Search Results
    // -------------------------------------------------------------
    console.log("\n7. Testing MatchScore Calculation & Breakdown Integration...");

    const resultsWithMatch = await searchTeamRequirements({
      currentUser: studentMe,
      q: "Campus Connect"
    });
    assert.strictEqual(resultsWithMatch.totalCount, 1);
    const matchedTeam = resultsWithMatch.results[0];
    assert.ok(matchedTeam.roles.length > 0);
    const roleMatch = matchedTeam.roles[0];
    assert.strictEqual(typeof roleMatch.matchScore, "number");
    assert.ok(roleMatch.matchScore > 0, "Student possessing React should have a positive match score for Frontend Engineer");
    assert.ok(roleMatch.breakdown, "Breakdown object must be attached");
    assert.strictEqual(typeof roleMatch.breakdown.S, "number");
    assert.strictEqual(typeof roleMatch.breakdown.C, "number");
    assert.strictEqual(typeof roleMatch.breakdown.R, "number");
    console.log("   ✓ MatchScore engine correctly called with complete breakdown on search results.");

    // -------------------------------------------------------------
    // TEST 7: Pagination Controls
    // -------------------------------------------------------------
    console.log("\n8. Testing Pagination (10 per page)...");

    // Add 12 dummy requirements to test page limit = 10
    for (let i = 1; i <= 12; i++) {
      await TeamRequirement.create({
        theme: "General",
        projectName: `Paging Test Team ${i}`,
        projectRequirement: "Test paging",
        deliverables: "None",
        teamSize: 3,
        deadline: futureDate,
        createdBy: otherLeadA._id,
        roles: [{
          title: "Developer",
          requiredSkills: ["Git"],
          openings: 1
        }]
      });
    }

    const page1 = await searchTeamRequirements({
      currentUser: studentMe,
      page: 1,
      limit: 10
    });
    assert.strictEqual(page1.currentPage, 1);
    assert.strictEqual(page1.results.length, 10, "Page 1 must contain exactly 10 results");
    assert.strictEqual(page1.hasNextPage, true);
    assert.strictEqual(page1.hasPrevPage, false);

    const page2 = await searchTeamRequirements({
      currentUser: studentMe,
      page: 2,
      limit: 10
    });
    assert.strictEqual(page2.currentPage, 2);
    assert.strictEqual(page2.results.length, 5, "Page 2 must contain remaining 5 results (15 total)");
    assert.strictEqual(page2.hasNextPage, false);
    assert.strictEqual(page2.hasPrevPage, true);
    console.log("   ✓ Pagination behaves accurately with 10 results per page and navigation flags.");

    // -------------------------------------------------------------
    // TEST 8: Candidate Search ("Find People" for Team Leads)
    // -------------------------------------------------------------
    console.log("\n9. Testing Candidate Search by Skill Name & Minimum Level...");

    const candidateVisibleHigh = await User.create({
      name: "Alice Advanced",
      email: "alice@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "BE",
      skills: [{ name: "Docker", level: 5 }],
      isEmailVerified: true,
      isProfileHidden: false
    });

    const candidateVisibleLow = await User.create({
      name: "Bob Beginner",
      email: "bob@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "SE",
      skills: [{ name: "Docker", level: 2 }],
      isEmailVerified: true,
      isProfileHidden: false
    });

    const candidateHidden = await User.create({
      name: "Charlie Hidden",
      email: "charlie@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      skills: [{ name: "Docker", level: 5 }],
      isEmailVerified: true,
      isProfileHidden: true // HIDDEN PROFILE
    });

    const candidateLocked = await User.create({
      name: "Dave Locked",
      email: "dave@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      skills: [{ name: "Docker", level: 5 }],
      isEmailVerified: true,
      lockedEvents: [eventHackathon._id.toString()] // LOCKED FOR THIS EVENT
    });

    // Lead Alpha searches for Docker at minLevel = 4 for team1 (EQUINOX)
    const foundCandidates = await getRecommendedCandidates(team1, team1.roles[0], otherLeadA._id, {
      skill: "Docker",
      minLevel: 4
    });

    const foundNames = foundCandidates.map(c => c.user.name);
    assert.ok(foundNames.includes("Alice Advanced"), "Alice (Docker Lvl 5) must be found");
    assert.strictEqual(foundNames.includes("Bob Beginner"), false, "Bob (Docker Lvl 2 < 4) must be excluded");
    assert.strictEqual(foundNames.includes("Charlie Hidden"), false, "Charlie (Hidden profile) must NEVER appear");
    assert.strictEqual(foundNames.includes("Dave Locked"), false, "Dave (Locked for event) must NEVER appear");
    console.log("   ✓ Candidate search filters by skill/level and strictly excludes hidden/locked candidates.");

    // -------------------------------------------------------------
    // TEST 9: Dynamic Filter Options Extraction
    // -------------------------------------------------------------
    console.log("\n10. Testing Dynamic Filter Extraction from Open Requirements...");

    const options = await getAvailableFilterOptions();
    assert.ok(Array.isArray(options.availableSkills));
    assert.ok(Array.isArray(options.availableRoles));
    assert.ok(Array.isArray(options.availableEvents));

    assert.ok(options.availableSkills.includes("React"), "React should be in dynamically extracted skills");
    assert.ok(options.availableSkills.includes("Python"), "Python should be in dynamically extracted skills");
    assert.ok(options.availableRoles.includes("Frontend Engineer"), "Frontend Engineer should be in dynamically extracted roles");
    console.log("   ✓ Dynamic filter options are properly collected from active open requirements.");

    console.log("\n=================================================");
    console.log("ALL PHASE 10A DISCOVER SEARCH TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    await teardown();
  }
}

runTests().catch(err => {
  console.error("Phase 10A discover search tests failed:", err);
  process.exit(1);
});
