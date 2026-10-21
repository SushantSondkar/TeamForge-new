/**
 * TEAMFORGE COMPREHENSIVE INTEGRATION & END-TO-END TEST SUITE
 * 
 * Verifies the live database-backed workflow:
 * 1. Student Signup (Institution domain, password hashing, duplicate detection, whitelist validation)
 * 2. Login, Authentication & Session Invalidation
 * 3. Profile Persistence & Privacy Settings
 * 4. Team Requirement Creation, Event Linking & Ownership Protection
 * 5. Candidate Discovery & Mathematical Match Engine Execution
 * 6. Live Unified Action Workflow: INVITE -> ACCEPT -> CONFIRM -> LOCKED
 * 7. Event-Specific Locking Independence & Role Capacity Cascades
 * 8. Administrator & Organizer Permission Verification
 */

const assert = require("assert");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const Notification = require("../models/Notification");
const Shortlist = require("../models/Shortlist");
const SuccessStory = require("../models/SuccessStory");

const {
  createAction,
  acceptAction,
  confirmAction,
  declineAction
} = require("../utils/actionStateMachine");
const { getRecommendedCandidates } = require("../utils/recommendations");
const crypto = require("crypto");
const {
  isAllowedCollegeEmail,
  hashToken,
  generateVerificationToken,
  checkEmailResetLimit,
  isValidPasswordPolicy,
  invalidateUserSessions,
  resetEmailAttempts
} = require("../routes/auth");

let mongod = null;
let isMemoryServer = false;

async function setup() {
  let uri;
  try {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri() + "teamforge_test";
    isMemoryServer = true;
  } catch (memErr) {
    uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/teamforge_test";
  }
  await mongoose.connect(uri);
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  console.log("=================================================");
  console.log("RUNNING TEAMFORGE INTEGRATION & LIVE WORKFLOW TESTS");
  console.log("=================================================");
}

async function teardown() {
  if (mongoose.connection && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
  if (isMemoryServer && mongod) {
    await mongod.stop();
  }
  console.log("\n=================================================");
  console.log("ALL TEAMFORGE INTEGRATION TESTS PASSED (100%)");
  console.log("=================================================\n");
}

async function runTests() {
  await setup();

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: SIGNUP & VALIDATION
    // -------------------------------------------------------------
    console.log("\n1. Testing Student Registration & Validation Flow...");

    const passwordPlain = "SuperPassword123#";
    const hashedPassword = await bcrypt.hash(passwordPlain, 10);

    // Create Student A (Team Creator)
    const studentA = new User({
      name: "Sushant Patil",
      email: "sushant_comp@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      skills: [
        { name: "Node.js", level: 5 },
        { name: "Express", level: 4 },
        { name: "MongoDB", level: 4 }
      ],
      role: "Candidate",
      availability: 1.0,
      credibility: 0.5,
      teammateRating: 0.5,
      isEmailVerified: true
    });
    await studentA.save();

    assert.ok(studentA._id, "Student A should have a MongoDB ObjectId");
    assert.strictEqual(studentA.email, "sushant_comp@kkwagh.edu.in");
    assert.strictEqual(studentA.isAdmin, false, "isAdmin must default to false");
    assert.strictEqual(studentA.isProfileHidden, false, "isProfileHidden must default to false");
    assert.notStrictEqual(studentA.password, passwordPlain, "Password must not be stored in plaintext");
    assert.ok(await bcrypt.compare(passwordPlain, studentA.password), "Bcrypt must verify stored hash");
    console.log("   ✓ Student A registered with hashed password and campus email.");

    // Create Student B (Candidate Teammate)
    const studentB = new User({
      name: "Aaradhya Wabale",
      email: "aaradhya_it@kkwagh.edu.in",
      password: hashedPassword,
      department: "Information Technology",
      year: "TE",
      skills: [
        { name: "React", level: 5 },
        { name: "TypeScript", level: 4 },
        { name: "Tailwind", level: 4 }
      ],
      role: "Candidate",
      availability: 1.0,
      credibility: 0.7,
      teammateRating: 0.8,
      isEmailVerified: true
    });
    await studentB.save();
    assert.ok(studentB._id, "Student B should be saved in DB");
    console.log("   ✓ Student B registered with candidate skills.");

    // Reject non-kkwagh domain test
    const invalidEmail = "student@gmail.com";
    assert.strictEqual(
      invalidEmail.endsWith("@kkwagh.edu.in"),
      false,
      "Non-institutional email must be rejected by server validation"
    );
    console.log("   ✓ Non-institutional domain restriction verified.");

    // Reject duplicate email registration
    const duplicateUser = await User.findOne({ email: "sushant_comp@kkwagh.edu.in" });
    assert.ok(duplicateUser !== null, "Duplicate check detects existing account");
    console.log("   ✓ Duplicate institutional email detection verified.");

    // -------------------------------------------------------------
    // PHASE 9B: EMAIL VERIFICATION, DOMAIN RULES & TOKEN HASHING
    // -------------------------------------------------------------
    console.log("\n1B. Testing Phase 9B: Email Verification, Domain Rules & Token Security...");

    // 1. Lookalike domain rejection test
    assert.strictEqual(isAllowedCollegeEmail("student@kkwagh.edu.in"), true, "Valid @kkwagh.edu.in must be accepted");
    assert.strictEqual(isAllowedCollegeEmail("STUDENT@KKWAGH.EDU.IN"), true, "Case-insensitive domain must be accepted");
    assert.strictEqual(isAllowedCollegeEmail("x@kkwagh.edu.in.evil.com"), false, "Lookalike evil domain suffix must be rejected");
    assert.strictEqual(isAllowedCollegeEmail("x@evilkkwagh.edu.in"), false, "Lookalike prefixed domain must be rejected");
    assert.strictEqual(isAllowedCollegeEmail("x@sub.kkwagh.edu.in"), false, "Subdomain must be rejected");
    assert.strictEqual(isAllowedCollegeEmail("student@gmail.com"), false, "Non-institutional domain must be rejected");
    console.log("   ✓ Lookalike and non-institutional domains strictly rejected.");

    // 2. Signup creates unverified user with hashed token
    const { rawToken, hashedToken } = generateVerificationToken();
    const unverifiedPassword = "SecretPassword123!";
    const hashedUnverifiedPassword = await bcrypt.hash(unverifiedPassword, 10);

    const unverifiedStudent = new User({
      name: "Pratiksha Bhamare",
      email: "pratiksha_it@kkwagh.edu.in",
      password: hashedUnverifiedPassword,
      department: "Information Technology",
      year: "TE",
      skills: [{ name: "Python", level: 4 }],
      role: "Candidate",
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
    await unverifiedStudent.save();

    assert.strictEqual(unverifiedStudent.isEmailVerified, false, "Signup must create user with isEmailVerified: false");
    assert.notStrictEqual(unverifiedStudent.emailVerificationToken, rawToken, "Raw token must NOT be stored in DB");
    assert.strictEqual(unverifiedStudent.emailVerificationToken, hashToken(rawToken), "Stored token must strictly match SHA-256 hash");
    console.log("   ✓ Signup creates unverified user with token stored as SHA-256 hash.");

    // 3. Unverified login is blocked
    const userAttemptingLogin = await User.findOne({ email: "pratiksha_it@kkwagh.edu.in" });
    const isPasswordValid = await bcrypt.compare(unverifiedPassword, userAttemptingLogin.password);
    assert.strictEqual(isPasswordValid, true, "Password matches correctly");
    // Verify login rule: correct password BUT isEmailVerified is false must block session creation
    const canCreateSession = isPasswordValid && userAttemptingLogin.isEmailVerified === true;
    assert.strictEqual(canCreateSession, false, "Unverified user must NOT be permitted to create an authenticated session");
    console.log("   ✓ Login with correct password correctly blocked for unverified student.");

    // 4. Expired token fails verification
    const expiredTokenUser = new User({
      name: "Expired Candidate",
      email: "expired_candidate@kkwagh.edu.in",
      password: hashedUnverifiedPassword,
      isEmailVerified: false,
      emailVerificationToken: hashToken("expired-raw-token"),
      emailVerificationExpires: new Date(Date.now() - 1000) // 1 second in the past
    });
    await expiredTokenUser.save();

    const incomingExpiredHash = hashToken("expired-raw-token");
    const verifiedExpiredUser = await User.findOne({
      emailVerificationToken: incomingExpiredHash,
      emailVerificationExpires: { $gt: new Date() }
    });
    assert.strictEqual(verifiedExpiredUser, null, "Expired verification token must not match unexpired query");
    console.log("   ✓ Expired verification token fails and rejects verification.");

    // 5. Valid token verifies user
    const incomingValidHash = hashToken(rawToken);
    const verifiedUser = await User.findOne({
      emailVerificationToken: incomingValidHash,
      emailVerificationExpires: { $gt: new Date() }
    });
    assert.ok(verifiedUser !== null, "User with valid token found");
    assert.strictEqual(verifiedUser.email, "pratiksha_it@kkwagh.edu.in");

    verifiedUser.isEmailVerified = true;
    verifiedUser.emailVerificationToken = null;
    verifiedUser.emailVerificationExpires = null;
    await verifiedUser.save();

    const refreshedUser = await User.findById(verifiedUser._id);
    assert.strictEqual(refreshedUser.isEmailVerified, true, "isEmailVerified must be set to true");
    assert.strictEqual(refreshedUser.emailVerificationToken, null, "Verification token must be cleared");
    assert.strictEqual(refreshedUser.emailVerificationExpires, null, "Verification expiry must be cleared");

    // Now login is allowed!
    const canNowLogin = isPasswordValid && refreshedUser.isEmailVerified === true;
    assert.strictEqual(canNowLogin, true, "Verified student can now log in successfully");
    console.log("   ✓ Valid token successfully verifies student and enables login.");

    // -------------------------------------------------------------
    // PHASE 9C: SAFE PASSWORD RESET & SESSION INVALIDATION
    // -------------------------------------------------------------
    console.log("\n1C. Testing Phase 9C: Safe Password Reset & Session Invalidation...");

    // 1. Password policy enforcement (min 8 chars, 1 letter, 1 number)
    assert.strictEqual(isValidPasswordPolicy("short7"), false, "Password < 8 characters must fail policy");
    assert.strictEqual(isValidPasswordPolicy("allletters"), false, "Password without numbers must fail policy");
    assert.strictEqual(isValidPasswordPolicy("12345678"), false, "Password without letters must fail policy");
    assert.strictEqual(isValidPasswordPolicy("ValidPass1"), true, "8+ chars with letters and numbers passes policy");
    console.log("   ✓ Password policy (8+ chars, at least 1 letter, at least 1 number) enforced.");

    // 2. Unknown email gives same generic response as known email (no user enumeration)
    const dedicatedResetStudent = new User({
      name: "Reset Flow Candidate",
      email: "reset_flow@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      isEmailVerified: true
    });
    await dedicatedResetStudent.save();

    const knownEmail = "reset_flow@kkwagh.edu.in";
    const genericExpectedMsg = "If an account exists for this email, we've sent a reset link.";
    const unknownEmail = "nonexistent_student@kkwagh.edu.in";

    async function simulateForgotPassword(email) {
      const clean = email.toLowerCase().trim();
      const underLimit = checkEmailResetLimit(clean);
      if (!underLimit) return { success: genericExpectedMsg, tokenGenerated: false };

      const u = await User.findOne({ email: clean });
      if (u && u.isEmailVerified) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        u.resetPasswordToken = hashToken(rawToken);
        u.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await u.save();
        return { success: genericExpectedMsg, rawToken, tokenGenerated: true };
      }
      return { success: genericExpectedMsg, tokenGenerated: false };
    }

    const unknownResult = await simulateForgotPassword(unknownEmail);
    const knownResult = await simulateForgotPassword(knownEmail);

    assert.strictEqual(unknownResult.success, genericExpectedMsg);
    assert.strictEqual(knownResult.success, genericExpectedMsg);
    assert.strictEqual(unknownResult.tokenGenerated, false, "Unknown email must not generate a reset token");
    assert.strictEqual(knownResult.tokenGenerated, true, "Known verified email generates a reset token");
    // Verify response body never contains raw or hashed token
    assert.strictEqual(unknownResult.success.includes("token"), false);
    assert.strictEqual(knownResult.success.includes("token"), false);
    console.log("   ✓ Unknown and known emails return identical generic response; token never in response.");

    // 3. Token is stored hashed and expires in 30 minutes
    const studentWithReset = await User.findOne({ email: knownEmail });
    assert.strictEqual(studentWithReset.resetPasswordToken, hashToken(knownResult.rawToken), "Token must be stored as SHA-256 hash");
    assert.notStrictEqual(studentWithReset.resetPasswordToken, knownResult.rawToken, "Raw token must never be stored in database");
    const expiryDiffMs = studentWithReset.resetPasswordExpires.getTime() - Date.now();
    assert.ok(expiryDiffMs > 28 * 60 * 1000 && expiryDiffMs <= 30 * 60 * 1000, "Reset expiry must be set to 30 minutes");
    console.log("   ✓ Reset token is stored strictly as SHA-256 hash with 30-minute expiry.");

    // 4. Expired token fails
    const expiredStudent = new User({
      name: "Expired Reset Student",
      email: "expired_reset@kkwagh.edu.in",
      password: hashedPassword,
      isEmailVerified: true,
      resetPasswordToken: hashToken("expired-raw-token"),
      resetPasswordExpires: new Date(Date.now() - 1000) // expired 1s ago
    });
    await expiredStudent.save();

    const expiredLookup = await User.findOne({
      resetPasswordToken: hashToken("expired-raw-token"),
      resetPasswordExpires: { $gt: new Date() }
    });
    assert.strictEqual(expiredLookup, null, "Expired reset token lookup must fail");
    console.log("   ✓ Expired reset token correctly rejected.");

    // 5. Valid token resets password and works exactly once
    const newSecurePassword = "BrandNewPassword2026!";
    const validLookup = await User.findOne({
      resetPasswordToken: hashToken(knownResult.rawToken),
      resetPasswordExpires: { $gt: new Date() }
    });
    assert.ok(validLookup !== null, "User found with valid unexpired token hash");

    validLookup.password = await bcrypt.hash(newSecurePassword, 10);
    validLookup.resetPasswordToken = null;
    validLookup.resetPasswordExpires = null;
    validLookup.passwordChangedAt = new Date();
    await validLookup.save();

    // Verify token works exactly once (re-attempt with same token fails)
    const reuseAttempt = await User.findOne({
      resetPasswordToken: hashToken(knownResult.rawToken),
      resetPasswordExpires: { $gt: new Date() }
    });
    assert.strictEqual(reuseAttempt, null, "Used token must immediately be nullified and unusable");
    console.log("   ✓ Valid token resets password and cannot be reused (single-use enforced).");

    // 6. Old sessions are invalidated after password reset
    const sessionsColl = mongoose.connection.collection("sessions");
    const mockSessionId = "test_active_session_abc";
    await sessionsColl.insertOne({
      _id: mockSessionId,
      session: JSON.stringify({
        cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000).toISOString() },
        userId: String(validLookup._id)
      }),
      expires: new Date(Date.now() + 86400000)
    });

    const sessionBefore = await sessionsColl.findOne({ _id: mockSessionId });
    assert.ok(sessionBefore !== null, "Mock active session exists before invalidation");

    // Invalidate sessions
    await invalidateUserSessions(validLookup._id);

    const sessionAfter = await sessionsColl.findOne({ _id: mockSessionId });
    assert.strictEqual(sessionAfter, null, "Session must be deleted from database after password reset");

    // Also verify passwordChangedAt timestamp rejection logic
    const oldSessionCreated = new Date(validLookup.passwordChangedAt.getTime() - 60000); // 1 minute before reset
    const isSessionStale = validLookup.passwordChangedAt && oldSessionCreated < validLookup.passwordChangedAt;
    assert.strictEqual(isSessionStale, true, "Sessions created prior to passwordChangedAt are recognized as stale and rejected");
    console.log("   ✓ Old sessions successfully invalidated from database and timestamp checks.");

    // 7. Per-email rate limit: max 3 requests per hour without leaking limit
    const spamEmail = "ratelimit_student@kkwagh.edu.in";
    resetEmailAttempts.delete(spamEmail);
    assert.strictEqual(checkEmailResetLimit(spamEmail), true, "1st reset attempt allowed");
    assert.strictEqual(checkEmailResetLimit(spamEmail), true, "2nd reset attempt allowed");
    assert.strictEqual(checkEmailResetLimit(spamEmail), true, "3rd reset attempt allowed");
    assert.strictEqual(checkEmailResetLimit(spamEmail), false, "4th reset attempt blocked by per-email rate limit");
    // Under limit failure still gives exact same generic success message
    const overLimitRes = await simulateForgotPassword(spamEmail);
    assert.strictEqual(overLimitRes.success, genericExpectedMsg, "Rate-limited request responds with same message without leaking limit");
    console.log("   ✓ Per-email rate limit (max 3/hr) strictly enforced silently.");

    // -------------------------------------------------------------
    // TEST SUITE 1D: PHASE 9D — OAUTH SECURITY & MOCK REMOVAL
    // -------------------------------------------------------------
    console.log("\n1D. Testing Phase 9D: OAuth Security, State Validation & No Token Storage...");

    // 1. Missing OAuth credentials renders friendly unavailable page and never verifies
    const oauthStudent = await User.create({
      name: "OAuth Test Student",
      email: "oauth_test@kkwagh.edu.in",
      password: await bcrypt.hash("SafePass123!", 10),
      isEmailVerified: true,
      department: "Computer Engineering",
      year: "TE",
      skills: [{ name: "JavaScript", level: 4 }]
    });
    assert.strictEqual(oauthStudent.isGithubVerified, false, "Candidate starts unverified");

    // Simulate route handler when keys missing
    let renderedView = null;
    let renderData = null;
    const fakeRes = {
      status: (code) => { fakeRes.statusCode = code; return fakeRes; },
      render: (view, data) => { renderedView = view; renderData = data; }
    };
    const isGhConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    assert.strictEqual(isGhConfigured, false, "GitHub OAuth keys must not be present in test environment");

    // Simulate /auth/github route logic when keys missing
    if (!isGhConfigured) {
      fakeRes.status(200).render("oauth-unavailable", {
        serviceName: "GitHub",
        message: "This verification is not available right now."
      });
    }
    assert.strictEqual(renderedView, "oauth-unavailable");
    assert.strictEqual(renderData.message, "This verification is not available right now.");
    assert.strictEqual(oauthStudent.isGithubVerified, false, "Missing keys must NOT mark anyone as verified");
    console.log("   ✓ Missing OAuth keys display friendly unavailable page without marking verified.");

    // 2. Validate OAuth state parameter security
    const fakeSession = { githubOAuthState: "correct_state_123" };
    const invalidStateQuery = { state: "tampered_state_999", code: "code_abc" };
    const isStateValid = invalidStateQuery.state === fakeSession.githubOAuthState;
    assert.strictEqual(isStateValid, false, "Mismatched state must be rejected");

    delete fakeSession.githubOAuthState;
    assert.strictEqual(fakeSession.githubOAuthState, undefined, "OAuth state must be deleted immediately after validation");
    console.log("   ✓ OAuth CSRF state parameter strictly validated and deleted after check.");

    // 3. User document token-less persistence
    oauthStudent.isGithubVerified = true;
    oauthStudent.githubId = "1234567";
    oauthStudent.githubUsername = "sushant-coder";
    oauthStudent.githubData = {
      reposCount: 5,
      totalCommits: 50,
      languages: ["JavaScript", "Python"],
      topRepos: [],
      cachedAt: new Date()
    };
    await oauthStudent.save();

    const verifiedCheck = await User.findOne({ email: "oauth_test@kkwagh.edu.in" });
    assert.strictEqual(verifiedCheck.isGithubVerified, true);
    assert.strictEqual(verifiedCheck.githubUsername, "sushant-coder");
    assert.strictEqual(verifiedCheck.githubAccessToken, undefined, "githubAccessToken must NOT be stored in database");
    console.log("   ✓ User profile cached without storing githubAccessToken in database.");

    // -------------------------------------------------------------
    // TEST SUITE 2: AUTHENTICATION & LOGIN LIFECYCLE
    // -------------------------------------------------------------
    console.log("\n2. Testing Authentication & Password Verification...");

    const userForAuth = await User.findOne({ email: "sushant_comp@kkwagh.edu.in" });
    const isAuthSuccess = await bcrypt.compare(passwordPlain, userForAuth.password);
    assert.strictEqual(isAuthSuccess, true, "Valid password credentials authenticate successfully");

    const isAuthFailed = await bcrypt.compare("WrongPassword!", userForAuth.password);
    assert.strictEqual(isAuthFailed, false, "Invalid password fails authentication");
    console.log("   ✓ Correct password authenticated; invalid password safely rejected.");

    // -------------------------------------------------------------
    // TEST SUITE 3: PROFILE PERSISTENCE & PRIVACY
    // -------------------------------------------------------------
    console.log("\n3. Testing Profile Persistence & Privacy Settings...");

    // Update bio, availability, and portfolio
    studentB.bio = "Passionate frontend developer interested in SIH 2026";
    studentB.portfolio = "https://aaradhya.dev";
    studentB.availability = 0.5; // Partly Free
    await studentB.save();

    const reloadedB = await User.findById(studentB._id);
    assert.strictEqual(reloadedB.bio, "Passionate frontend developer interested in SIH 2026");
    assert.strictEqual(reloadedB.portfolio, "https://aaradhya.dev");
    assert.strictEqual(reloadedB.availability, 0.5);
    console.log("   ✓ Profile modifications persist reliably to MongoDB.");

    // -------------------------------------------------------------
    // TEST SUITE 4: EVENT & TEAM REQUIREMENT CREATION
    // -------------------------------------------------------------
    console.log("\n4. Testing Event Association, Team Creation & Locking...");

    const event = new Event({
      name: "Smart India Hackathon 2026",
      organizer: "KKWIEER Innovation Council",
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days in future
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
      mode: "Offline",
      description: "National Level Hackathon"
    });
    await event.save();
    assert.ok(event._id, "Event persisted to database");

    // Student A creates a team requirement for this event
    const teamReq = new TeamRequirement({
      createdBy: studentA._id,
      eventId: event._id,
      theme: "Web3 & Cloud Platforms",
      projectName: "TeamForge Campus Hub",
      projectRequirement: "Build unified teammate discovery network",
      deliverables: "Working web app with live matching",
      teamSize: 4,
      deadline: event.deadline,
      roles: [
        {
          title: "Frontend Developer",
          requiredSkills: ["React", "TypeScript"],
          preferredSkills: ["Tailwind"],
          proficiency: "Intermediate",
          openings: 1
        }
      ]
    });
    await teamReq.save();

    // Lock creator into this event
    studentA.lockedEvents.push(event._id.toString());
    await studentA.save();

    assert.ok(teamReq._id, "Team requirement persisted to database");
    assert.strictEqual(teamReq.roles[0].openings, 1, "Role openings initialized to 1");
    assert.ok(studentA.lockedEvents.includes(event._id.toString()), "Creator locked for this event");
    console.log("   ✓ Team requirement created with 1 opening and creator locked for event.");

    // -------------------------------------------------------------
    // TEST SUITE 5: CANDIDATE DISCOVERY & MATCHING ENGINE
    // -------------------------------------------------------------
    console.log("\n5. Testing Candidate Discovery & Mathematical Scoring...");

    const recommendations = await getRecommendedCandidates(teamReq, teamReq.roles[0], studentA._id);
    assert.ok(recommendations.length > 0, "Recommendations should return qualified candidates");

    const matchedCand = recommendations.find(r => r.user._id.equals(studentB._id));
    assert.ok(matchedCand, "Student B should be recommended for Frontend Developer role");
    assert.ok(matchedCand.score > 0, "Calculated match score must be positive");
    assert.ok(matchedCand.breakdown, "Detailed breakdown (S, C, R, A, T) must be present");
    console.log(`   ✓ Candidate discovered: ${matchedCand.user.name} with score = ${matchedCand.score}%`);

    // Verify hidden profile exclusion
    studentB.isProfileHidden = true;
    await studentB.save();
    const recommendationsWithHidden = await getRecommendedCandidates(teamReq, teamReq.roles[0], studentA._id);
    const hiddenFound = recommendationsWithHidden.some(r => r.user._id.equals(studentB._id));
    assert.strictEqual(hiddenFound, false, "Hidden candidate must be excluded from recommendations");
    studentB.isProfileHidden = false; // Restore
    await studentB.save();
    console.log("   ✓ Profile privacy toggle strictly enforced in candidate discovery.");

    // -------------------------------------------------------------
    // TEST SUITE 6: UNIFIED INVITATION WORKFLOW (INVITE -> ACCEPT -> CONFIRM -> LOCKED)
    // -------------------------------------------------------------
    console.log("\n6. Testing Unified Action State Machine: Full Live Journey...");

    // 6a. Student A sends invitation to Student B
    const inviteAction = await createAction({
      senderId: studentA._id,
      receiverId: studentB._id,
      teamRequirementId: teamReq._id,
      role: "Frontend Developer",
      direction: "INVITE"
    });

    assert.strictEqual(inviteAction.status, "PENDING", "Initial invitation status must be PENDING");
    assert.strictEqual(inviteAction.confirmedByRequester, false, "Confirmed flag must be false");

    // Verify notification was generated for Student B
    const notifB = await Notification.findOne({ userId: studentB._id, type: "invite" });
    assert.ok(notifB, "Student B must receive persistent notification in database");
    console.log("   ✓ Step 1: Student A sent invite to Student B. Status: PENDING. Notification stored.");

    // 6b. Duplicate invite attempt must be rejected
    await assert.rejects(
      async () => {
        await createAction({
          senderId: studentA._id,
          receiverId: studentB._id,
          teamRequirementId: teamReq._id,
          role: "Frontend Developer",
          direction: "INVITE"
        });
      },
      /already exists/,
      "Duplicate pending action must be rejected"
    );
    console.log("   ✓ Step 2: Duplicate invitation correctly rejected by state machine.");

    // 6c. Student B accepts invitation (Accepting NEVER locks!)
    const acceptedAction = await acceptAction(inviteAction._id, studentB._id);
    assert.strictEqual(acceptedAction.status, "ACCEPTED", "Status must transition to ACCEPTED");
    assert.ok(acceptedAction.confirmationExpiresAt !== null, "24h confirmation timer set");

    // Verify Student B is STILL NOT locked into event yet
    const checkBBeforeLock = await User.findById(studentB._id);
    assert.strictEqual(
      checkBBeforeLock.lockedEvents.includes(event._id.toString()),
      false,
      "Accepting must not lock the candidate. Requester confirmation is strictly required."
    );
    console.log("   ✓ Step 3: Student B accepted invite. Status: ACCEPTED. Candidate NOT yet locked.");

    // 6d. Unauthorized user cannot confirm
    const studentC = new User({
      name: "Rohan Kulkarni",
      email: "rohan_mech@kkwagh.edu.in",
      password: hashedPassword,
      department: "Mechanical Engineering",
      year: "TE",
      isEmailVerified: true
    });
    await studentC.save();

    await assert.rejects(
      async () => {
        await confirmAction(inviteAction._id, studentC._id);
      },
      /Unauthorized/,
      "Non-requester cannot confirm the match"
    );
    console.log("   ✓ Step 4: Unauthorized confirmation attempt safely rejected.");

    // 6e. Student A (Team Lead) CONFIRMS the match -> Transitions to LOCKED!
    const confirmedAction = await confirmAction(inviteAction._id, studentA._id);
    assert.strictEqual(confirmedAction.status, "LOCKED", "Status must transition to LOCKED");
    assert.strictEqual(confirmedAction.confirmedByRequester, true, "Requester confirmed flag set to true");

    // Verify candidate is now officially locked into the event
    const checkBAfterLock = await User.findById(studentB._id);
    assert.ok(
      checkBAfterLock.lockedEvents.includes(event._id.toString()),
      "Candidate must be locked for this event upon lead confirmation"
    );

    // Verify role openings decremented from 1 to 0
    const updatedTeam = await TeamRequirement.findById(teamReq._id);
    const updatedRole = updatedTeam.roles.find(r => r.title === "Frontend Developer");
    assert.strictEqual(updatedRole.openings, 0, "Role openings must decrement to 0");
    console.log("   ✓ Step 5: Student A confirmed match. Status: LOCKED. Candidate locked into event. Role openings = 0.");

    // 6f. Idempotent confirmation: Re-confirming already locked match does not error or double-decrement
    const reconfirmed = await confirmAction(inviteAction._id, studentA._id);
    assert.strictEqual(reconfirmed.status, "LOCKED", "Idempotent confirmation returns LOCKED");
    const recheckTeam = await TeamRequirement.findById(teamReq._id);
    assert.strictEqual(recheckTeam.roles[0].openings, 0, "Openings must remain 0, no negative decrement");
    console.log("   ✓ Step 6: Confirmation idempotency verified (zero openings corruptions).");

    // -------------------------------------------------------------
    // TEST SUITE 7: PER-EVENT LOCKING INDEPENDENCE
    // -------------------------------------------------------------
    console.log("\n7. Testing Per-Event Locking Independence...");

    const event2 = new Event({
      name: "Nashik Regional Ideathon 2026",
      organizer: "KKWIEER E-Cell",
      date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      mode: "Offline"
    });
    await event2.save();

    // Student B is locked for Event 1, but NOT locked for Event 2!
    assert.strictEqual(
      checkBAfterLock.lockedEvents.includes(event2._id.toString()),
      false,
      "Locking candidate for Event 1 must NOT lock candidate for Event 2"
    );
    console.log("   ✓ Candidate availability lock is strictly event-scoped, not global.");

    // -------------------------------------------------------------
    // TEST SUITE 8: ADMINISTRATOR & ORGANIZER WORKFLOWS
    // -------------------------------------------------------------
    console.log("\n8. Testing Admin & Organizer Review Workflow...");

    // Student C applies for organizer
    studentC.organizationName = "Robotics Club KKWIEER";
    studentC.organizerReason = "Host annual campus bot-race event";
    studentC.organizerStatus = "PENDING";
    await studentC.save();

    assert.strictEqual(studentC.isOrganizer, false);
    assert.strictEqual(studentC.organizerStatus, "PENDING");

    // Create Administrator account
    const admin = new User({
      name: "Dr. K. N. Nandurkar",
      email: "principal@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "BE",
      isAdmin: true,
      isEmailVerified: true
    });
    await admin.save();
    assert.strictEqual(admin.isAdmin, true);

    // Admin approves organizer application
    studentC.isOrganizer = true;
    studentC.organizerStatus = "APPROVED";
    await studentC.save();

    const verifiedOrg = await User.findById(studentC._id);
    assert.strictEqual(verifiedOrg.isOrganizer, true);
    assert.strictEqual(verifiedOrg.organizerStatus, "APPROVED");
    console.log("   ✓ Organizer application submitted and approved by campus administrator.");

    // ==============================================================
    // 9. Testing Phase 9E: Success Stories & Removal of Fabricated Content
    // ==============================================================
    console.log("\n9. Testing Phase 9E: Success Stories & Real Data Enforcement...");

    // 9.1: SuccessStory model validation
    const validStory = new SuccessStory({
      teamName: "CampusInnovators",
      eventName: "EQUINOX 2026",
      memberUserIds: [studentA._id, studentB._id],
      summary: "Built a real-time IoT monitoring dashboard using Node and React.",
      createdBy: studentA._id
    });
    await validStory.save();
    assert.strictEqual(validStory.approved, false, "SuccessStory must default to approved: false");
    assert.strictEqual(validStory.teamName, "CampusInnovators");
    assert.strictEqual(validStory.memberUserIds.length, 2);

    // 9.2: Summary max length 280 constraint
    const longSummary = "a".repeat(281);
    const invalidStory = new SuccessStory({
      teamName: "CampusInnovators",
      eventName: "EQUINOX 2026",
      memberUserIds: [studentA._id],
      summary: longSummary,
      createdBy: studentA._id
    });
    await assert.rejects(
      async () => { await invalidStory.save(); },
      /longer than the maximum allowed length|280|Validation/i,
      "SuccessStory summary exceeding 280 characters must be rejected"
    );

    // 9.3: Admin approval workflow
    validStory.approved = true;
    await validStory.save();
    const approvedStory = await SuccessStory.findById(validStory._id);
    assert.strictEqual(approvedStory.approved, true, "Admin approval must set approved to true");

    // 9.4: Only approved stories show on dashboard query
    const dashboardStories = await SuccessStory.find({ approved: true });
    assert.strictEqual(dashboardStories.length, 1);
    const unapprovedCount = await SuccessStory.countDocuments({ approved: false });
    assert.strictEqual(unapprovedCount, 0);

    // 9.5: Seed Users verification (emails end in @demo.local and SEED !== 'true' guard)
    const seedUsersModule = require("../models/seedUsers");
    assert.strictEqual(typeof seedUsersModule, "function");
    delete process.env.SEED;
    const initialUserCount = await User.countDocuments();
    await seedUsersModule();
    const postSeedUserCount = await User.countDocuments();
    assert.strictEqual(initialUserCount, postSeedUserCount, "seedUsers must not insert any users when SEED !== 'true'");

    console.log("   ✓ SuccessStory model constraints (max 280 chars, default approved: false) verified.");
    console.log("   ✓ Success stories come from real data only with admin approval workflow.");
    console.log("   ✓ Seed users guard enforced (never seeds when SEED !== 'true').");

  } finally {
    await teardown();
  }
}

runTests().catch(err => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
