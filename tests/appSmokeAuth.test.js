/**
 * tests/appSmokeAuth.test.js
 * 
 * Authenticated smoke test suite (Node http, in-memory DB, zero external dependencies):
 * 1. Seeds verified student, verified admin, and test records directly into in-memory DB.
 * 2. Authenticates over real HTTP (extracting CSRF token and session cookies).
 * 3. Asserts 200 OK and clean response bodies (no ReferenceError, TypeError, stack traces, file paths) for:
 *    - Student: /dashboard, /discover (all 3 tabs), /profile, /profile/edit, /notifications,
 *               /leaderboard, /events, /events/:id, /feedback, /how-it-works, /team-requirement/new, /reviews
 *    - Asserts Discover HTML has exactly one active tab pane.
 *    - Asserts Notifications HTML shows both notif-read and notif-unread classes for seeded notifications.
 *    - Tests /profile/photo CSRF rejection without token and success with valid base64 image + token.
 *    - Admin: /admin/stats, /admin/feedback, /admin/banner, /admin/organizers, /admin/stories,
 *             and both CSV exports (/admin/stats/export, /admin/feedback/export).
 */

const assert = require("assert");
const http = require("http");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "authenticated_smoke_session_secret_32_chars";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "authenticated_smoke_cookie_secret_32_chars";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "authenticated_smoke_csrf_secret_32_chars";

const app = require("../app");
const connectDB = require("../models/db");
const mongoose = require("mongoose");
const User = require("../models/User");
const Event = require("../models/Event");
const TeamRequirement = require("../models/TeamRequirement");
const Notification = require("../models/Notification");
const Feedback = require("../models/Feedback");
const Announcement = require("../models/Announcement");
const SuccessStory = require("../models/SuccessStory");

class SessionClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = {};
  }

  updateCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const ch of cookieHeaders) {
      const parts = ch.split(";")[0].split("=");
      const name = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      this.cookies[name] = val;
    }
  }

  getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  request(pathname, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.baseUrl);
      const reqHeaders = Object.assign({}, options.headers || {});
      const cookieStr = this.getCookieHeader();
      if (cookieStr) {
        reqHeaders["Cookie"] = cookieStr;
      }

      const req = http.request(url, {
        method: options.method || "GET",
        headers: reqHeaders
      }, (res) => {
        this.updateCookies(res.headers["set-cookie"]);
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async get(pathname) {
    return this.request(pathname, { method: "GET" });
  }

  async post(pathname, data, headers = {}) {
    const isJson = typeof data === "object" && !(data instanceof URLSearchParams);
    const bodyStr = isJson ? JSON.stringify(data) : data.toString();
    const contentType = isJson ? "application/json" : "application/x-www-form-urlencoded";
    return this.request(pathname, {
      method: "POST",
      headers: Object.assign({
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(bodyStr)
      }, headers),
      body: bodyStr
    });
  }

  async login(email, password) {
    const resGet = await this.get("/login");
    assert.strictEqual(resGet.statusCode, 200, "GET /login must return 200");
    const csrfMatch = resGet.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, "Must find CSRF token in /login HTML form");
    const csrfToken = csrfMatch[1];

    const formData = new URLSearchParams();
    formData.append("_csrf", csrfToken);
    formData.append("email", email);
    formData.append("password", password);

    const resPost = await this.post("/login", formData);
    assert.ok([200, 302].includes(resPost.statusCode), `POST /login must redirect or return 200, got ${resPost.statusCode}`);
    return csrfToken;
  }
}

function assertCleanBody(body, path) {
  const forbidden = [
    "is not defined",
    "Cannot read properties",
    "ReferenceError",
    "TypeError"
  ];
  for (const phrase of forbidden) {
    assert.ok(
      !body.includes(phrase),
      `Body for ${path} must NOT contain "${phrase}"`
    );
  }
  const filePathRegex = /([A-Za-z]:\\[a-zA-Z0-9_\-\\]+|\/(?:Users|home|root)\/[a-zA-Z0-9_\-\/]+)/i;
  assert.ok(
    !filePathRegex.test(body),
    `Body for ${path} must NOT leak local file paths`
  );
}

async function runAuthSmokeTests() {
  console.log("=================================================");
  console.log("RUNNING AUTHENTICATED SMOKE TEST SUITE (Node http)");
  console.log("=================================================\n");

  await connectDB();

  // Create HTTP server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`1. Server started on ephemeral port ${port}`);

  try {
    // -----------------------------------------------------------
    // Step 1: Directly seed verified student and verified admin
    // -----------------------------------------------------------
    console.log("2. Seeding test records in database...");
    const hashedPassword = await bcrypt.hash("CampusPass123!", 10);

    const student = await User.create({
      name: "Aaradhya Wabale",
      email: "aaradhya_comp@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      role: "Candidate",
      isEmailVerified: true,
      isGithubVerified: true,
      githubUsername: "aaradhyawabale",
      skills: [
        { name: "Node.js", level: 5 },
        { name: "React", level: 4 },
        { name: "MongoDB", level: 4 }
      ],
      availability: 1.0,
      bio: "Full-stack engineer passionate about hackathon projects"
    });

    const admin = await User.create({
      name: "Admin Officer",
      email: "admin_dean@kkwagh.edu.in",
      password: hashedPassword,
      department: "Computer Engineering",
      year: "BE",
      role: "Lead",
      isEmailVerified: true,
      isAdmin: true,
      availability: 1.0
    });

    // Seed hackathon event for /events/:id
    const testEvent = await Event.create({
      name: "K.K. Wagh Hackathon 2026",
      organizer: "KKWIEER Campus Club",
      date: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      mode: "Offline",
      description: "Annual campus engineering hackathon",
      createdBy: admin._id
    });

    // Seed team requirement
    const teamReq = await TeamRequirement.create({
      createdBy: student._id,
      eventId: testEvent._id,
      projectName: "TeamForge Innovation",
      theme: "Web3 & AI",
      teamSize: 4,
      deliverables: "Working MVP and live presentation",
      projectRequirement: "Full-stack developers with Node.js and React",
      deadline: testEvent.deadline,
      roles: [
        {
          title: "Backend Specialist",
          requiredSkills: ["Node.js", "MongoDB"],
          preferredSkills: ["Redis"],
          proficiency: "Intermediate",
          openings: 1
        }
      ]
    });

    // Seed notifications (both read and unread)
    await Notification.create([
      {
        userId: student._id,
        title: "Welcome to TeamForge",
        subtitle: "Your profile has been created and verified",
        type: "success",
        read: true,
        time: "Just now"
      },
      {
        userId: student._id,
        title: "New Team Opportunity",
        subtitle: "A lead viewed your profile for Hackathon 2026",
        type: "info",
        read: false,
        time: "5m ago"
      }
    ]);

    // Seed feedback and announcement banner for admin views
    await Feedback.create({
      rating: 5,
      category: "general",
      comment: "Algorithmic match score worked great for finding teammates!",
      userId: student._id
    });

    await Announcement.create({
      title: "Hackathon Registration Open",
      text: "Submit team requirements before the deadline next week.",
      active: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdBy: admin._id
    });

    // Seed pending organizer and success story for admin review panels
    const pendingOrg = await User.create({
      name: "Club President",
      email: "club_pres@kkwagh.edu.in",
      password: hashedPassword,
      department: "Information Technology",
      year: "TE",
      isEmailVerified: true,
      organizerStatus: "PENDING",
      organizerDetails: {
        clubName: "Google Developer Student Club",
        facultyAdvisor: "Prof. K. Sharma",
        contactNumber: "9876543210"
      }
    });

    await SuccessStory.create({
      teamName: "CodeCraft Champions",
      eventName: "Smart India Hackathon",
      summary: "Built an automated soil telemetry system using TeamForge matchmaking.",
      approved: false,
      createdBy: student._id
    });

    console.log("   ✓ Test records successfully seeded in memory.\n");

    // -----------------------------------------------------------
    // Step 2: Student Login over HTTP
    // -----------------------------------------------------------
    console.log("3. Authenticating student over real HTTP...");
    const studentClient = new SessionClient(baseUrl);
    await studentClient.login("aaradhya_comp@kkwagh.edu.in", "CampusPass123!");
    console.log("   ✓ Student authenticated with session cookies.\n");

    // -----------------------------------------------------------
    // Step 3: GET each student page & verify status 200 and clean body
    // -----------------------------------------------------------
    console.log("4. Testing student pages for 200 OK and clean body rendering...");
    const studentPages = [
      { path: "/dashboard", name: "Dashboard" },
      { path: "/discover", name: "Discover (Default: Smart Recs)" },
      { path: "/discover?tab=search", name: "Discover (Search Teams Tab)" },
      { path: "/discover?tab=browse-events", name: "Discover (Browse Events Tab)" },
      { path: "/profile", name: "Profile" },
      { path: "/profile/edit", name: "Profile Edit" },
      { path: "/notifications", name: "Notifications" },
      { path: "/leaderboard", name: "Leaderboard" },
      { path: "/events", name: "Events Directory" },
      { path: `/events/${testEvent._id}`, name: "Event Detail" },
      { path: "/feedback", name: "Feedback Form" },
      { path: "/how-it-works", name: "How It Works" },
      { path: "/team-requirement/new", name: "Team Requirement Wizard Step 1" },
      { path: "/reviews", name: "Peer Reviews" }
    ];

    for (const page of studentPages) {
      const res = await studentClient.get(page.path);
      assert.strictEqual(res.statusCode, 200, `Page ${page.name} (${page.path}) must return 200 OK (got ${res.statusCode})`);
      assertCleanBody(res.body, page.path);
      console.log(`   ✓ ${page.name} (${page.path}) -> 200 OK`);
    }

    // -----------------------------------------------------------
    // Step 4: Discover tab pane markup: exactly ONE pane active
    // -----------------------------------------------------------
    console.log("\n5. Testing Discover tab pane markup assertions...");
    const discoverTabs = [
      { path: "/discover", activeId: "smart-recs" },
      { path: "/discover?tab=search", activeId: "search-teams" },
      { path: "/discover?tab=browse-events", activeId: "browse-events" }
    ];

    for (const tabInfo of discoverTabs) {
      const res = await studentClient.get(tabInfo.path);
      assert.strictEqual(res.statusCode, 200);

      // Match all tab panes that have class "active"
      const activePanes = res.body.match(/class=["'][^"']*tab-pane[^"']*active[^"']*["']/g) || [];
      assert.strictEqual(
        activePanes.length,
        1,
        `Discover page ${tabInfo.path} must contain exactly ONE active tab-pane, found ${activePanes.length}`
      );
      assert.ok(
        res.body.includes(`id="${tabInfo.activeId}"`),
        `Discover page ${tabInfo.path} must contain active tab pane id "${tabInfo.activeId}"`
      );
      console.log(`   ✓ ${tabInfo.path} correctly renders exactly 1 active tab pane (${tabInfo.activeId})`);
    }

    // -----------------------------------------------------------
    // Step 5: Notifications page shows read and unread classes
    // -----------------------------------------------------------
    console.log("\n6. Testing Notifications page read and unread CSS classes...");
    const notifsRes = await studentClient.get("/notifications");
    assert.strictEqual(notifsRes.statusCode, 200);
    assert.ok(
      notifsRes.body.includes("notif-read"),
      "Notifications page must contain 'notif-read' class for read notifications"
    );
    assert.ok(
      notifsRes.body.includes("notif-unread"),
      "Notifications page must contain 'notif-unread' class for unread notifications"
    );
    console.log("   ✓ Notifications page correctly displays 'notif-read' and 'notif-unread' classes.");

    // -----------------------------------------------------------
    // Step 6: Testing /profile/photo CSRF protection & validation
    // -----------------------------------------------------------
    console.log("\n7. Testing /profile/photo CSRF protection and validation...");

    // 6a. Request WITHOUT CSRF token must be rejected (403)
    const validPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const noCsrfRes = await studentClient.post("/profile/photo", {
      profilePic: validPngBase64
    });
    assert.strictEqual(
      noCsrfRes.statusCode,
      403,
      `POST /profile/photo without CSRF token must be rejected with 403 Forbidden (got ${noCsrfRes.statusCode})`
    );
    console.log("   ✓ POST /profile/photo without CSRF token correctly rejected with 403 Forbidden.");

    // Extract CSRF token from /profile/edit
    const editPageRes = await studentClient.get("/profile/edit");
    const editCsrfMatch = editPageRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(editCsrfMatch, "Must find CSRF token on /profile/edit");
    const studentCsrfToken = editCsrfMatch[1];

    // 6b. Request with invalid format / fake magic bytes must be rejected (400)
    const fakePhotoRes = await studentClient.post(
      "/profile/photo",
      {
        _csrf: studentCsrfToken,
        profilePic: "data:image/png;base64,VGhpcyBpcyBub3QgYSBwbmcgaW1hZ2UgZGF0YQ=="
      },
      { "X-CSRF-Token": studentCsrfToken }
    );
    assert.strictEqual(fakePhotoRes.statusCode, 400, "Fake magic bytes must be rejected with 400 Bad Request");
    console.log("   ✓ Fake photo with mismatched magic bytes correctly rejected with 400.");

    // 6c. Request with valid PNG and fresh CSRF token must succeed (200)
    const freshEditRes = await studentClient.get("/profile/edit");
    const freshCsrfMatch = freshEditRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(freshCsrfMatch, "Must find fresh CSRF token on /profile/edit");
    const freshCsrfToken = freshCsrfMatch[1];

    const validPhotoRes = await studentClient.post(
      "/profile/photo",
      {
        _csrf: freshCsrfToken,
        profilePic: validPngBase64
      },
      { "X-CSRF-Token": freshCsrfToken }
    );
    assert.strictEqual(validPhotoRes.statusCode, 200, "Valid photo upload must return 200 OK");
    const photoJson = JSON.parse(validPhotoRes.body);
    assert.strictEqual(photoJson.success, true);
    console.log("   ✓ Valid photo upload with CSRF token and valid magic bytes succeeded (200 OK).");

    // Helper to fetch fresh CSRF token from /profile/edit
    async function getFreshCsrf() {
      const res = await studentClient.get("/profile/edit");
      const match = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
      assert.ok(match, "Must find CSRF token on /profile/edit");
      return match[1];
    }

    // 6d. Strict photo validation: wrong prefix must be rejected early (400)
    const csrfForWrongPrefix = await getFreshCsrf();
    const wrongPrefixRes = await studentClient.post(
      "/profile/photo",
      {
        _csrf: csrfForWrongPrefix,
        profilePic: "data:text/plain;base64,aGVsbG8gd29ybGQ="
      },
      { "X-CSRF-Token": csrfForWrongPrefix }
    );
    assert.strictEqual(wrongPrefixRes.statusCode, 400, "Wrong prefix must be rejected with 400");
    const wrongPrefixJson = JSON.parse(wrongPrefixRes.body);
    assert.ok(wrongPrefixJson.error.includes("Invalid image format"));
    console.log("   ✓ Photo with wrong prefix rejected early before decoding (400).");

    // 6e. Strict photo validation: garbage base64 input must be rejected early (400)
    const csrfForGarbage = await getFreshCsrf();
    const garbageRes = await studentClient.post(
      "/profile/photo",
      {
        _csrf: csrfForGarbage,
        profilePic: "data:image/png;base64,!!!NotValidBase64@@@"
      },
      { "X-CSRF-Token": csrfForGarbage }
    );
    assert.strictEqual(garbageRes.statusCode, 400, "Garbage base64 must be rejected with 400");
    const garbageJson = JSON.parse(garbageRes.body);
    assert.ok(garbageJson.error.includes("corrupted or contains invalid base64"));
    console.log("   ✓ Photo with garbage input rejected early by strict base64 regex (400).");

    // 6f. Strict photo validation: oversized string input (>450k chars)
    const csrfForOversized = await getFreshCsrf();
    const oversizedStr = "data:image/png;base64," + "A".repeat(460000);
    const oversizedRes = await studentClient.post(
      "/profile/photo",
      {
        _csrf: csrfForOversized,
        profilePic: oversizedStr
      },
      { "X-CSRF-Token": csrfForOversized }
    );
    assert.ok([400, 413].includes(oversizedRes.statusCode), `Oversized photo must return 400 or 413 (got ${oversizedRes.statusCode})`);
    console.log("   ✓ Oversized photo payload rejected early with size limit error.");

    // 6g. JSON limit audit: realistic maximum-size payload to wizard (must not return 413)
    const csrfForWizard = await getFreshCsrf();
    const maxWizardPayload = {
      _csrf: csrfForWizard,
      eventId: String(testEvent._id),
      theme: "Artificial Intelligence & Edge Computing",
      projectName: "Automated Campus Energy Grid Optimization & Distributed Telemetry",
      projectRequirement: "X".repeat(4000), // 4 KB description
      deliverables: "Y".repeat(4000), // 4 KB deliverables
      teamSize: "4",
      deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    };
    const wizardRes = await studentClient.post(
      "/team-requirement/new/define-team",
      maxWizardPayload
    );
    assert.notStrictEqual(wizardRes.statusCode, 413, "Maximum realistic wizard payload must NOT be rejected with 413");
    assert.strictEqual(wizardRes.statusCode, 200, "Wizard step 2 should return 200 with open-roles view");
    console.log("   ✓ Realistic maximum-size wizard payload safely processed without 413.");

    // 6h. Rate limit test: trigger actionLimiter on POST /profile/photo and assert 429 appears
    console.log("   Testing actionLimiter 429 response on rapid /profile/photo requests...");
    let hit429 = false;
    for (let i = 0; i < 35; i++) {
      const csrfForRate = await getFreshCsrf();
      const rateRes = await studentClient.post(
        "/profile/photo",
        {
          _csrf: csrfForRate,
          profilePic: validPngBase64
        },
        { "X-CSRF-Token": csrfForRate }
      );
      if (rateRes.statusCode === 429) {
        hit429 = true;
        break;
      }
    }
    assert.strictEqual(hit429, true, "actionLimiter must trigger a 429 after exceeding max requests");
    console.log("   ✓ actionLimiter successfully triggered with 429 Too Many Requests.");

    // Reset & isolate limiter state so other tests and suites are unaffected
    const { actionLimiter } = require("../middleware/rateLimiters");
    if (actionLimiter.resetKey) {
      actionLimiter.resetKey("127.0.0.1");
      actionLimiter.resetKey("::1");
      actionLimiter.resetKey("::ffff:127.0.0.1");
    }
    console.log("   ✓ actionLimiter state cleanly reset after test.");

    // -----------------------------------------------------------
    // Step 7: Admin Login over HTTP & Admin Views
    // -----------------------------------------------------------
    console.log("\n8. Authenticating admin over real HTTP...");
    const adminClient = new SessionClient(baseUrl);
    await adminClient.login("admin_dean@kkwagh.edu.in", "CampusPass123!");
    console.log("   ✓ Admin authenticated with session cookies.\n");

    console.log("9. Testing admin pages and CSV exports...");
    const adminPages = [
      { path: "/admin/stats", name: "Admin Stats Dashboard" },
      { path: "/admin/feedback", name: "Admin Feedback Panel" },
      { path: "/admin/banner", name: "Admin Announcement Banner" },
      { path: "/admin/organizers", name: "Admin Organizer Applications" },
      { path: "/admin/stories", name: "Admin Success Stories" }
    ];

    for (const page of adminPages) {
      const res = await adminClient.get(page.path);
      assert.strictEqual(res.statusCode, 200, `Admin page ${page.name} (${page.path}) must return 200 OK`);
      assertCleanBody(res.body, page.path);
      console.log(`   ✓ Admin ${page.name} (${page.path}) -> 200 OK`);
    }

    // Both CSV exports
    const statsExportRes = await adminClient.get("/admin/stats/export");
    assert.strictEqual(statsExportRes.statusCode, 200, "GET /admin/stats/export must return 200 OK");
    assert.ok(
      statsExportRes.headers["content-type"].includes("text/csv"),
      "Stats export must return Content-Type text/csv"
    );
    assert.ok(statsExportRes.body.includes("Metric Category"), "Stats CSV must contain metric headers");
    console.log("   ✓ CSV Export 1: /admin/stats/export -> 200 OK (text/csv)");

    const feedbackExportRes = await adminClient.get("/admin/feedback/export");
    assert.strictEqual(feedbackExportRes.statusCode, 200, "GET /admin/feedback/export must return 200 OK");
    assert.ok(
      feedbackExportRes.headers["content-type"].includes("text/csv"),
      "Feedback export must return Content-Type text/csv"
    );
    assert.ok(feedbackExportRes.body.includes("Feedback ID"), "Feedback CSV must contain feedback headers");
    console.log("   ✓ CSV Export 2: /admin/feedback/export -> 200 OK (text/csv)");

    console.log("\n=================================================");
    console.log("ALL AUTHENTICATED SMOKE TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.disconnect();
    setTimeout(() => {
      process.exit(0);
    }, 200).unref();
  }
}

runAuthSmokeTests().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch((err) => {
  console.error("Authenticated smoke test failed:", err);
  process.exit(1);
});
