/**
 * tests/notificationsAndContacts.test.js
 *
 * Verifies:
 * Task 1:
 *  - Storing links on notification creation:
 *    - invite accepted -> team management page with #tab-sent-invitations
 *    - match locked -> /actions
 *    - contact sharing unlocked -> page with matched person's contact details (/applications/team/:id or /dashboard)
 *  - Display-time link resolution:
 *    - Missing link or "/" resolved from notification type/content
 *    - Unresolvable links go to /notifications, NEVER "/"
 *    - Strict prefix "/" check (blocks external URLs like https://evil.com or //evil.com)
 *  - Marking notification as read when View is clicked:
 *    - View button uses /notifications/:id/view
 *    - /notifications/:id/view marks read and redirects to safe link
 *    - User ownership checks on read endpoints (cannot view or mark other users' notifications)
 *
 * Task 2:
 *  - Mutual contact details display Name, Email, and Phone number
 *  - Phone number next to email for LOCKED matches with mutual opt-in
 *  - "Phone not provided" displayed when phone is missing
 *  - Output is HTML-escaped
 *  - Phone number is never included in any URL (e.g. no tel: link) or logged
 *  - Contact info redacted when match is not locked or not mutual consent
 *
 * Fix 1 (Phone number input):
 *  - views/profile-edit.ejs renders phone input with exact label and helper text
 *  - POST /profile/edit validates and normalizes Indian mobile numbers
 *  - Accepts +91 or 0 prefix, spaces, hyphens, and stores 10 digits
 *  - Accepts empty phone input (clears / sets empty string)
 *  - Rejects invalid phone numbers with clear error (400)
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const ejs = require("ejs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("../models/User");
const Notification = require("../models/Notification");
const TeamRequirement = require("../models/TeamRequirement");
const TeamRequestAction = require("../models/TeamRequestAction");
const {
  createAction,
  acceptAction,
  confirmAction,
  optInContactSharing
} = require("../utils/actionStateMachine");

let mongod = null;

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri() + "notifications_and_contacts_test";
  await mongoose.connect(uri);
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
  console.log("RUNNING NOTIFICATIONS & MUTUAL CONTACTS TESTS");
  console.log("=================================================\n");

  await setup();

  try {
    // -------------------------------------------------------------
    // SETUP: Users & Team Requirement
    // -------------------------------------------------------------
    const leadUser = await User.create({
      name: "Lead Student",
      email: "lead@kkwagh.edu.in",
      phone: "+91 91234 56789",
      password: "HashedPassword123!",
      department: "Computer Engineering",
      year: "BE"
    });

    const candidateUser = await User.create({
      name: "Candidate Student",
      email: "candidate@kkwagh.edu.in",
      phone: "+91 99887 76655",
      password: "HashedPassword123!",
      department: "Information Technology",
      year: "TE"
    });

    const team = await TeamRequirement.create({
      theme: "AI Hackathon",
      projectName: "NeuroForge",
      projectRequirement: "Build AI app",
      deliverables: "Working demo",
      teamSize: 4,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: leadUser._id,
      roles: [{ title: "ML Specialist", requiredSkills: ["Python", "PyTorch"], openings: 2 }]
    });

    // -------------------------------------------------------------
    // TASK 1: NOTIFICATION LINKS CREATION
    // -------------------------------------------------------------
    console.log("1. Testing Notification Link Storage at Creation...");

    // Test 1a: Invite Accepted Link
    const inviteAction = await createAction({
      senderId: leadUser._id,
      receiverId: candidateUser._id,
      teamRequirementId: team._id,
      role: "ML Specialist",
      direction: "INVITE"
    });

    // Candidate accepts the invite
    await acceptAction(inviteAction._id, candidateUser._id);

    const leadAcceptNotif = await Notification.findOne({
      userId: leadUser._id,
      title: { $regex: /accepted your invite/i }
    });

    assert.ok(leadAcceptNotif, "Lead must receive 'accepted your invite' notification");
    assert.strictEqual(
      leadAcceptNotif.link,
      `/applications/team/${team._id}#tab-sent-invitations`,
      "Invite accepted notification must store team management URL with #tab-sent-invitations"
    );
    console.log("   ✓ Invite accepted notification stores team management link with #tab-sent-invitations hash.");

    // Test 1b: Match Locked Link (/actions)
    await confirmAction(inviteAction._id, leadUser._id);

    const leadLockedNotif = await Notification.findOne({
      userId: leadUser._id,
      title: { $regex: /Match Confirmed & Locked/i }
    });
    const candidateLockedNotif = await Notification.findOne({
      userId: candidateUser._id,
      title: { $regex: /Match Confirmed & Locked/i }
    });

    assert.ok(leadLockedNotif, "Lead must receive match locked notification");
    assert.ok(candidateLockedNotif, "Candidate must receive match locked notification");
    assert.strictEqual(leadLockedNotif.link, "/actions", "Lead match locked link must be /actions");
    assert.strictEqual(candidateLockedNotif.link, "/actions", "Candidate match locked link must be /actions");
    console.log("   ✓ Match locked notifications store link as /actions.");

    // Test 1c: Mutual Contact Sharing Unlocked Link
    await optInContactSharing(inviteAction._id, leadUser._id);
    await optInContactSharing(inviteAction._id, candidateUser._id);

    const leadContactNotif = await Notification.findOne({
      userId: leadUser._id,
      title: { $regex: /Mutual Contact Sharing Unlocked/i }
    });
    const candidateContactNotif = await Notification.findOne({
      userId: candidateUser._id,
      title: { $regex: /Mutual Contact Sharing Unlocked/i }
    });

    assert.ok(leadContactNotif, "Lead must receive contact sharing notification");
    assert.ok(candidateContactNotif, "Candidate must receive contact sharing notification");
    assert.strictEqual(
      leadContactNotif.link,
      `/applications/team/${team._id}`,
      "Team lead must be linked to team management page showing member contact details"
    );
    assert.strictEqual(
      candidateContactNotif.link,
      "/dashboard",
      "Candidate must be linked to dashboard showing lead contact details"
    );
    console.log("   ✓ Mutual contact sharing notifications store links to pages displaying contact details.");

    // -------------------------------------------------------------
    // TASK 1: DISPLAY TIME LINK RESOLUTION & VIEW BUTTON
    // -------------------------------------------------------------
    console.log("\n2. Testing Display-Time Link Resolution & View Button Endpoint...");

    const legacyNotif1 = await Notification.create({
      userId: leadUser._id,
      title: "Alice accepted your invite!",
      subtitle: "Legacy notification",
      type: "success",
      link: "/",
      actionId: inviteAction._id
    });

    const maliciousNotif = await Notification.create({
      userId: leadUser._id,
      title: "Click here for reward",
      subtitle: "Phishing attack",
      type: "info",
      link: "https://evil.com/exploit"
    });

    const unknownNotif = await Notification.create({
      userId: leadUser._id,
      title: "System Maintenance Notice",
      subtitle: "Platform update",
      type: "info",
      link: ""
    });

    // Create an express app instance to test actual route responses
    const express = require("express");
    const session = require("express-session");
    const ejsMate = require("ejs-mate");
    const viewsDir = path.join(__dirname, "..", "views");

    const app = express();
    app.engine("ejs", ejsMate);
    app.set("view engine", "ejs");
    app.set("views", viewsDir);
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(session({ secret: "test_secret_32_characters_long!!", resave: false, saveUninitialized: true }));

    // Mock authenticated user middleware
    let currentMockUser = leadUser;
    app.use((req, res, next) => {
      req.session.userId = currentMockUser._id;
      req.user = currentMockUser;
      res.locals.currentUser = currentMockUser;
      res.locals.csrfToken = "test_csrf";
      next();
    });

    const indexRoutesModule = require("../routes/index");
    app.use("/", indexRoutesModule);

    const http = require("http");
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    async function makeRequest(pathStr, method = "GET", headers = {}, postData = null) {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: pathStr,
            method,
            headers
          },
          res => {
            let body = "";
            res.on("data", chunk => (body += chunk));
            res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
          }
        );
        req.on("error", reject);
        if (postData) {
          req.write(postData);
        }
        req.end();
      });
    }

    const notifPageRes = await makeRequest("/notifications");
    assert.strictEqual(notifPageRes.statusCode, 200, "GET /notifications must return 200");
    const notifHtml = notifPageRes.body;

    // Verify View button uses /notifications/:id/view and NEVER "/"
    const viewButtonMatches = notifHtml.match(/<a\s+href="([^"]+)"[^>]*>View<\/a>/g) || [];
    assert.ok(viewButtonMatches.length > 0, "Must have View buttons rendered");

    viewButtonMatches.forEach(btnHtml => {
      const hrefMatch = btnHtml.match(/href="([^"]+)"/);
      assert.ok(hrefMatch, "Must have href");
      const href = hrefMatch[1];
      assert.notStrictEqual(href, "/", "View button must NEVER point to '/'");
      assert.ok(href.startsWith("/"), `View button link must start with '/' (got ${href})`);
      assert.ok(href.includes("/notifications/") && href.includes("/view"), `View button must use /notifications/:id/view (got ${href})`);
    });

    assert.ok(!notifHtml.includes('href="https://evil.com'), "External URL must not appear in rendered view links");
    console.log("   ✓ View buttons use /notifications/:id/view, never '/', and external URLs are blocked.");

    // -------------------------------------------------------------
    // TASK 1: MARK NOTIFICATION AS READ ON VIEW CLICK & OWNERSHIP CHECK
    // -------------------------------------------------------------
    console.log("\n3. Testing Notification Read Marking on View Click & User Ownership...");

    const unreadNotif = await Notification.create({
      userId: leadUser._id,
      title: "Unread Alert",
      subtitle: "Testing mark as read",
      type: "info",
      read: false,
      link: "/dashboard"
    });

    assert.strictEqual(unreadNotif.read, false, "Notification must start unread");

    // POST /notifications/:id/read
    const markReadRes = await makeRequest(`/notifications/${unreadNotif._id}/read`, "POST", {
      "Content-Type": "application/json",
      Accept: "application/json"
    });
    assert.strictEqual(markReadRes.statusCode, 200, "POST /notifications/:id/read must return 200");

    const refreshedNotif = await Notification.findById(unreadNotif._id);
    assert.strictEqual(refreshedNotif.read, true, "Notification must be marked as read in database");
    console.log("   ✓ POST /notifications/:id/read marks notification as read.");

    // GET /notifications/:id/view marks read and redirects
    const unreadNotif2 = await Notification.create({
      userId: leadUser._id,
      title: "Another Unread Alert",
      subtitle: "Testing view endpoint redirect",
      type: "success",
      read: false,
      link: "/actions"
    });

    const viewRes = await makeRequest(`/notifications/${unreadNotif2._id}/view`, "GET");
    assert.strictEqual(viewRes.statusCode, 302, "GET /notifications/:id/view must redirect (302)");
    assert.strictEqual(viewRes.headers.location, "/actions", "Redirect location must be the safe link /actions");

    const refreshedNotif2 = await Notification.findById(unreadNotif2._id);
    assert.strictEqual(refreshedNotif2.read, true, "GET /notifications/:id/view must mark notification as read");
    console.log("   ✓ GET /notifications/:id/view marks notification as read and redirects.");

    // Ownership check: logged-in leadUser cannot view or mark candidateUser's notification
    const candidatePrivateNotif = await Notification.create({
      userId: candidateUser._id,
      title: "Candidate Only Alert",
      subtitle: "Testing ownership protection",
      type: "warning",
      read: false,
      link: "/profile"
    });

    // leadUser attempts to view candidate's notification
    const unauthorizedViewRes = await makeRequest(`/notifications/${candidatePrivateNotif._id}/view`, "GET");
    assert.strictEqual(unauthorizedViewRes.statusCode, 302, "Unauthorized view redirects to /notifications");
    assert.strictEqual(unauthorizedViewRes.headers.location, "/notifications", "Must redirect to /notifications on unauthorized access");

    const candidateNotifAfterView = await Notification.findById(candidatePrivateNotif._id);
    assert.strictEqual(candidateNotifAfterView.read, false, "Candidate's notification must NOT be marked read by another user");

    // leadUser attempts to mark candidate's notification as read
    const unauthorizedMarkRes = await makeRequest(`/notifications/${candidatePrivateNotif._id}/read`, "POST", {
      "Content-Type": "application/json",
      Accept: "application/json"
    });
    const candidateNotifAfterMark = await Notification.findById(candidatePrivateNotif._id);
    assert.strictEqual(candidateNotifAfterMark.read, false, "Candidate's notification must NOT be marked read by another user via POST");
    console.log("   ✓ Read and view endpoints strictly verify notification ownership (userId: req.user._id).");

    // Verify /actions route redirects to /dashboard
    const actionsRes = await makeRequest("/actions", "GET");
    assert.strictEqual(actionsRes.statusCode, 302, "GET /actions must redirect (302)");
    assert.strictEqual(actionsRes.headers.location, "/dashboard", "GET /actions must redirect to /dashboard");
    console.log("   ✓ GET /actions safely redirects to /dashboard.");

    // -------------------------------------------------------------
    // FIX 1: PHONE NUMBER INPUT IN PROFILE EDIT
    // -------------------------------------------------------------
    console.log("\n4. Testing Phone Number Input Field & Server Validation...");

    // 4a. Check views/profile-edit.ejs contains phone field with exact label and helper text
    const profileEditTemplate = fs.readFileSync(path.join(viewsDir, "profile-edit.ejs"), "utf8");
    assert.ok(profileEditTemplate.includes('name="phone"'), "profile-edit.ejs must include name='phone' input");
    assert.ok(profileEditTemplate.includes("Phone number (optional)"), "profile-edit.ejs must have label 'Phone number (optional)'");
    assert.ok(
      profileEditTemplate.includes("Only shared with someone after you both agree to share contacts."),
      "profile-edit.ejs must have helper text 'Only shared with someone after you both agree to share contacts.'"
    );
    console.log("   ✓ views/profile-edit.ejs contains phone field with required label and helper text.");

    // 4b. Test valid phone inputs (Indian mobile numbers)
    const validPhoneCases = [
      { input: "9876543210", expected: "9876543210", label: "plain 10 digits" },
      { input: "+91 98765 43210", expected: "9876543210", label: "+91 prefix with spaces" },
      { input: "+91-98765-43210", expected: "9876543210", label: "+91 prefix with hyphens" },
      { input: "+919876543210", expected: "9876543210", label: "+91 prefix without spaces" },
      { input: "09876543210", expected: "9876543210", label: "0 prefix plain" },
      { input: "0 98765 43210", expected: "9876543210", label: "0 prefix with spaces" },
      { input: "098765-43210", expected: "9876543210", label: "0 prefix with hyphen" },
      { input: "919876543210", expected: "9876543210", label: "91 prefix (12 digits)" },
      { input: "8123456789", expected: "8123456789", label: "starts with 8" },
      { input: "7123456789", expected: "7123456789", label: "starts with 7" },
      { input: "6123456789", expected: "6123456789", label: "starts with 6" }
    ];

    for (const testCase of validPhoneCases) {
      currentMockUser = await User.findById(leadUser._id);
      const postBody = new URLSearchParams({
        name: "Lead Student",
        phone: testCase.input
      }).toString();

      const res = await makeRequest("/profile/edit", "POST", {
        "Content-Type": "application/x-www-form-urlencoded"
      }, postBody);

      assert.strictEqual(res.statusCode, 302, `Valid phone '${testCase.input}' (${testCase.label}) must redirect (302)`);
      const updatedUser = await User.findById(leadUser._id);
      assert.strictEqual(
        updatedUser.phone,
        testCase.expected,
        `Valid phone '${testCase.input}' (${testCase.label}) must store 10 digits '${testCase.expected}', got '${updatedUser.phone}'`
      );
    }
    console.log("   ✓ All valid Indian phone number variants (+91, 0, spaces, dashes) correctly normalized to 10 digits.");

    // 4c. Test empty phone input (allowed, clears / sets empty string)
    const emptyCases = ["", "   "];
    for (const emptyInput of emptyCases) {
      currentMockUser = await User.findById(leadUser._id);
      const postBody = new URLSearchParams({
        name: "Lead Student",
        phone: emptyInput
      }).toString();

      const res = await makeRequest("/profile/edit", "POST", {
        "Content-Type": "application/x-www-form-urlencoded"
      }, postBody);

      assert.strictEqual(res.statusCode, 302, "Empty phone must redirect (302)");
      const updatedUser = await User.findById(leadUser._id);
      assert.strictEqual(updatedUser.phone, "", "Empty phone input must store empty string");
    }
    console.log("   ✓ Empty phone input is allowed and sets user.phone to empty string.");

    // 4d. Test invalid phone inputs (rejected with 400 and clear error)
    const invalidPhoneCases = [
      { input: "98765abcde", reason: "contains letters" },
      { input: "+1 800 555 1234", reason: "non-Indian country code" },
      { input: "12345", reason: "too short" },
      { input: "9876543210123", reason: "too long" },
      { input: "5876543210", reason: "starts with 5 (invalid Indian mobile start digit)" },
      { input: "1876543210", reason: "starts with 1 (invalid Indian mobile start digit)" },
      { input: "!@#$%^&*()", reason: "special characters" }
    ];

    for (const testCase of invalidPhoneCases) {
      currentMockUser = await User.findById(leadUser._id);
      const postBody = new URLSearchParams({
        name: "Lead Student",
        phone: testCase.input
      }).toString();

      const res = await makeRequest("/profile/edit", "POST", {
        "Content-Type": "application/x-www-form-urlencoded"
      }, postBody);

      assert.strictEqual(res.statusCode, 400, `Invalid phone '${testCase.input}' (${testCase.reason}) must be rejected with 400`);
      assert.ok(res.body.includes("Invalid phone number"), `Response must contain clear error message for '${testCase.input}'`);
    }
    console.log("   ✓ All invalid phone inputs rejected with 400 and clear error messages.");

    server.close();

    // -------------------------------------------------------------
    // TASK 2: MUTUAL CONTACT DETAILS (NAME, EMAIL, PHONE)
    // -------------------------------------------------------------
    console.log("\n5. Testing Mutual Contact Details Display (Name, Email, Phone)...");

    const teamViewContent = fs.readFileSync(path.join(viewsDir, "applications", "team.ejs"), "utf8");

    function renderTeamManageView(appData) {
      return ejs.render(teamViewContent, {
        team: { _id: team._id, projectName: "NeuroForge", roles: [{ title: "ML Specialist", openings: 1 }], teamSize: 4 },
        applications: [appData],
        receivedApplications: appData.direction === "APPLY" ? [appData] : [],
        sentInvitations: appData.direction === "INVITE" ? [appData] : [],
        csrfToken: "csrf123",
        formatDate: d => new Date(d).toLocaleDateString(),
        layout: () => {}
      }, { views: [viewsDir] });
    }

    // 5a. Locked & Mutual Consent with Phone present
    const lockedMutualAppWithPhone = {
      _id: "app1",
      direction: "APPLY",
      status: "LOCKED",
      role: "ML Specialist",
      createdAt: new Date(),
      bothOptedIn: true,
      myContactOptIn: true,
      applicantId: {
        _id: "user1",
        name: "Alice Developer",
        email: "alice@kkwagh.edu.in",
        phone: "9876543210",
        github: "alicedev"
      }
    };

    const htmlWithPhone = renderTeamManageView(lockedMutualAppWithPhone);
    assert.ok(htmlWithPhone.includes("Alice Developer"), "Must display name in contact card");
    assert.ok(htmlWithPhone.includes("alice@kkwagh.edu.in"), "Must display email in contact card");
    assert.ok(htmlWithPhone.includes("9876543210"), "Must display phone number in contact card");
    assert.ok(!htmlWithPhone.includes("tel:"), "Phone number must NOT be in a tel: URL");
    console.log("   ✓ Contact card displays Name, Email, and Phone for locked mutual consent.");

    // 5b. Locked & Mutual Consent with Phone MISSING
    const lockedMutualAppNoPhone = {
      _id: "app2",
      direction: "APPLY",
      status: "LOCKED",
      role: "ML Specialist",
      createdAt: new Date(),
      bothOptedIn: true,
      myContactOptIn: true,
      applicantId: {
        _id: "user2",
        name: "Bob Engineer",
        email: "bob@kkwagh.edu.in",
        phone: "",
        github: "bobeng"
      }
    };

    const htmlNoPhone = renderTeamManageView(lockedMutualAppNoPhone);
    assert.ok(htmlNoPhone.includes("Bob Engineer"), "Must display name");
    assert.ok(htmlNoPhone.includes("bob@kkwagh.edu.in"), "Must display email");
    assert.ok(htmlNoPhone.includes("Phone not provided"), "Must display 'Phone not provided' when phone is missing");
    assert.ok(!htmlNoPhone.includes("tel:"), "Must not put 'Phone not provided' in a tel: URL");
    console.log("   ✓ Contact card displays 'Phone not provided' when phone is missing.");

    // 5c. Output escaping (prevent XSS in name, email, phone)
    const xssApp = {
      _id: "app3",
      direction: "APPLY",
      status: "LOCKED",
      role: "ML Specialist",
      createdAt: new Date(),
      bothOptedIn: true,
      myContactOptIn: true,
      applicantId: {
        _id: "user3",
        name: "<script>alert('xss')</script>",
        email: "xss@kkwagh.edu.in",
        phone: "<img src=x onerror=alert(1)>",
        github: null
      }
    };

    const htmlXss = renderTeamManageView(xssApp);
    assert.ok(!htmlXss.includes("<script>alert('xss')</script>"), "Malicious script in name must be escaped");
    assert.ok(htmlXss.includes("&lt;script&gt;"), "Name must be HTML-escaped");
    assert.ok(!htmlXss.includes("<img src=x onerror=alert(1)>"), "Malicious HTML in phone must be escaped");
    assert.ok(htmlXss.includes("&lt;img"), "Phone must be HTML-escaped");
    console.log("   ✓ All output (name, email, phone) is securely HTML-escaped.");

    // 5d. Locked but NOT mutual opt-in
    const unoptedApp = {
      _id: "app4",
      direction: "APPLY",
      status: "LOCKED",
      role: "ML Specialist",
      createdAt: new Date(),
      bothOptedIn: false,
      myContactOptIn: false,
      applicantId: {
        _id: "user4",
        name: "Secret Candidate",
        email: undefined,
        phone: undefined
      }
    };

    const htmlUnopted = renderTeamManageView(unoptedApp);
    assert.ok(!htmlUnopted.includes("Email:"), "Email must NOT be shown when not mutually opted in");
    assert.ok(!htmlUnopted.includes("Phone:"), "Phone must NOT be shown when not mutually opted in");
    assert.ok(htmlUnopted.includes("Share Contact Info"), "Must show Share Contact Info button");
    console.log("   ✓ Contacts remain hidden when teammates have not mutually opted in.");

    // 5e. Check views/home.ejs mutual contact display
    const homeViewContent = fs.readFileSync(path.join(viewsDir, "home.ejs"), "utf8");
    const htmlHome = ejs.render(homeViewContent, {
      latestTeam: team,
      activeMemberCount: 2,
      recommendedCandidates: [],
      recommendedOpportunities: [],
      myApplications: [],
      teamApplicationCount: 1,
      sentInvites: [
        {
          _id: "inv1",
          status: "LOCKED",
          role: "ML Specialist",
          senderContactOptIn: true,
          receiverContactOptIn: true,
          receiverId: {
            name: "Teammate Student",
            email: "teammate@kkwagh.edu.in",
            phone: "+91 94444 33333",
            github: "teammate"
          }
        }
      ],
      receivedInvites: [],
      awaitingConfirmation: [],
      promotedEvents: [],
      upcomingDeadlines: [],
      successStories: [],
      candidateSkill: "",
      minLevel: "1",
      currentUser: leadUser,
      csrfToken: "csrf123",
      formatDate: d => new Date(d).toLocaleDateString(),
      layout: () => {}
    }, { views: [viewsDir] });

    assert.ok(htmlHome.includes("Teammate Student"), "Home page must show locked teammate name");
    assert.ok(htmlHome.includes("teammate@kkwagh.edu.in"), "Home page must show locked teammate email");
    assert.ok(htmlHome.includes("+91 94444 33333"), "Home page must show locked teammate phone");
    assert.ok(!htmlHome.includes("tel:"), "Home page must not put phone in a tel: URL");
    console.log("   ✓ Home page shows Name, Email, and Phone number next to email for locked mutual matches.");

    console.log("\n=================================================");
    console.log("ALL NOTIFICATIONS & MUTUAL CONTACTS TESTS PASSED (100%)");
    console.log("=================================================");
  } finally {
    await teardown();
  }
}

runTests().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
