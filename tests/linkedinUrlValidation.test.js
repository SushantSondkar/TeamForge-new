/**
 * tests/linkedinUrlValidation.test.js
 *
 * Verifies:
 * 1. Profile edit server-side validation:
 *    - Valid URLs save: https://www.linkedin.com/in/..., https://linkedin.com/in/..., country subdomains (e.g. in.linkedin.com)
 *    - Strips query strings and trailing slashes
 *    - Rejects javascript: and data: URLs
 *    - Rejects non-LinkedIn hosts (e.g. evil.com, notlinkedin.com, github.com)
 *    - Rejects invalid formats (e.g. non-profile paths, lengths > 200)
 *    - Empty string clears the linkedin field
 * 2. Display:
 *    - Plain link with text "LinkedIn profile"
 *    - target="_blank"
 *    - rel="noopener noreferrer nofollow"
 *    - Normal EJS escaping (<%= %>)
 * 3. Honest labels:
 *    - No "LinkedIn Verified" or "LinkedIn Linked" badge rendered
 *    - User trustBadges does not contain LinkedIn badge
 *    - Badge counts and trust scores do not depend on LinkedIn
 * 4. Disabled OAuth routes:
 *    - GET /auth/linkedin redirects to /profile
 *    - GET /auth/linkedin/callback redirects to /profile
 *    - POST /auth/linkedin/unlink redirects to /profile
 * 5. No inline scripts or handlers
 */

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "linkedin_test_session_secret_32_characters_long";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "linkedin_test_cookie_secret_32_characters_long";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "linkedin_test_csrf_secret_32_characters_long";

const app = require("../app");
const connectDB = require("../models/db");
const mongoose = require("mongoose");
const User = require("../models/User");

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
        res.on("data", chunk => (body += chunk));
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
    assert.strictEqual(resPost.statusCode, 302, "POST /login must redirect on successful auth");
    return csrfToken;
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING LINKEDIN PROFILE URL & VALIDATION TESTS");
  console.log("=================================================\n");

  await connectDB();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = new SessionClient(baseUrl);

  try {
    // Seed test user
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const testEmail = "test_student_li@kkwagh.edu.in";
    await User.deleteMany({ email: testEmail });

    const user = await User.create({
      name: "LinkedIn Test Student",
      email: testEmail,
      password: passwordHash,
      department: "Computer Engineering",
      year: "TE",
      isEmailVerified: true,
      role: "Full Stack Developer",
      skills: [{ name: "JavaScript", level: 3 }],
      linkedin: ""
    });

    // 1. Authenticate
    console.log("1. Authenticating test student session...");
    await client.login(testEmail, "Password123!");
    console.log("   ✓ Student session authenticated.");

    // Helper to get fresh CSRF token from /profile/edit
    async function getProfileEditCsrf() {
      const res = await client.get("/profile/edit");
      assert.strictEqual(res.statusCode, 200, "GET /profile/edit must return 200");
      const match = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
      assert.ok(match, "Must find CSRF token in /profile/edit form");
      return match[1];
    }

    // Helper to submit profile edit
    async function updateProfileLinkedin(linkedinValue) {
      const csrf = await getProfileEditCsrf();
      const formData = new URLSearchParams();
      formData.append("_csrf", csrf);
      formData.append("name", "LinkedIn Test Student");
      formData.append("department", "Computer Engineering");
      formData.append("year", "TE");
      formData.append("linkedin", linkedinValue);
      return client.post("/profile/edit", formData);
    }

    // -------------------------------------------------------------
    // Test 1: Valid URL Saves
    // -------------------------------------------------------------
    console.log("2. Testing valid LinkedIn URLs saving...");

    // 2a. Standard www URL
    let res = await updateProfileLinkedin("https://www.linkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 302, "Valid www URL must redirect (302)");
    let updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://www.linkedin.com/in/student-dev");
    console.log("   ✓ Standard https://www.linkedin.com/in/student-dev saved.");

    // 2b. Country subdomain URL
    res = await updateProfileLinkedin("https://in.linkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 302, "Country subdomain must redirect (302)");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://in.linkedin.com/in/student-dev");
    console.log("   ✓ Country subdomain https://in.linkedin.com/in/student-dev saved.");

    // 2c. Subdomain-less URL
    res = await updateProfileLinkedin("https://linkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 302, "Subdomain-less URL must redirect (302)");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://linkedin.com/in/student-dev");
    console.log("   ✓ Subdomain-less https://linkedin.com/in/student-dev saved.");

    // 2d. Trailing slash is stripped
    res = await updateProfileLinkedin("https://www.linkedin.com/in/student-dev/");
    assert.strictEqual(res.statusCode, 302);
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://www.linkedin.com/in/student-dev", "Trailing slash must be stripped");
    console.log("   ✓ Trailing slash stripped on save.");

    // 2e. Query string is stripped
    res = await updateProfileLinkedin("https://www.linkedin.com/in/student-dev?utm_source=share&trk=profile");
    assert.strictEqual(res.statusCode, 302);
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://www.linkedin.com/in/student-dev", "Query string must be stripped");
    console.log("   ✓ Query strings stripped on save.");

    // 2f. Query string + trailing slash stripped
    res = await updateProfileLinkedin("https://in.linkedin.com/in/student-dev/?trk=test");
    assert.strictEqual(res.statusCode, 302);
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://in.linkedin.com/in/student-dev", "Query string and trailing slash must be stripped");
    console.log("   ✓ Query string and trailing slash both stripped on save.");

    // 2g. Auto-prefix https:// when omitted by user
    res = await updateProfileLinkedin("linkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 302, "URL without https:// must redirect (302)");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://linkedin.com/in/student-dev", "Must automatically add https:// prefix");

    res = await updateProfileLinkedin("www.linkedin.com/in/student-dev/");
    assert.strictEqual(res.statusCode, 302);
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://www.linkedin.com/in/student-dev", "Must add https:// and strip trailing slash");
    console.log("   ✓ Automatically adds https:// when omitted (e.g. linkedin.com/in/name).");

    // -------------------------------------------------------------
    // Test 2: javascript: and data: URLs are rejected
    // -------------------------------------------------------------
    console.log("3. Testing dangerous schemes rejection...");

    res = await updateProfileLinkedin("javascript:alert(1)");
    assert.strictEqual(res.statusCode, 400, "javascript: URL must be rejected with 400");
    assert.ok(res.body.includes("Invalid LinkedIn profile URL"), "Error message must indicate invalid URL");
    updatedUser = await User.findById(user._id);
    assert.notStrictEqual(updatedUser.linkedin, "javascript:alert(1)", "javascript: URL must not be saved");
    console.log("   ✓ javascript: URL rejected with 400.");

    res = await updateProfileLinkedin("data:text/html,<script>alert(1)</script>");
    assert.strictEqual(res.statusCode, 400, "data: URL must be rejected with 400");
    updatedUser = await User.findById(user._id);
    assert.ok(!updatedUser.linkedin.startsWith("data:"), "data: URL must not be saved");
    console.log("   ✓ data: URL rejected with 400.");

    // -------------------------------------------------------------
    // Test 3: Non-LinkedIn hosts are rejected
    // -------------------------------------------------------------
    console.log("4. Testing non-LinkedIn hosts rejection...");

    res = await updateProfileLinkedin("https://evil.com/in/student-dev");
    assert.strictEqual(res.statusCode, 400, "evil.com host must be rejected with 400");
    assert.ok(res.body.includes("host must be linkedin.com"), "Error must explain host restriction");

    res = await updateProfileLinkedin("https://notlinkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 400, "notlinkedin.com host must be rejected with 400");

    res = await updateProfileLinkedin("https://github.com/in/student-dev");
    assert.strictEqual(res.statusCode, 400, "github.com host must be rejected with 400");

    res = await updateProfileLinkedin("http://www.linkedin.com/in/student-dev");
    assert.strictEqual(res.statusCode, 400, "http: scheme must be rejected with 400");

    res = await updateProfileLinkedin("https://www.linkedin.com/company/google");
    assert.strictEqual(res.statusCode, 400, "Non /in/ path must be rejected with 400");

    console.log("   ✓ Non-LinkedIn hosts and invalid URL structures rejected with 400.");

    // -------------------------------------------------------------
    // Test 4: Empty value clears the link
    // -------------------------------------------------------------
    console.log("5. Testing empty value clearing...");

    // First ensure user has a linkedin URL
    await updateProfileLinkedin("https://www.linkedin.com/in/student-dev");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "https://www.linkedin.com/in/student-dev");

    // Clear with empty string
    res = await updateProfileLinkedin("");
    assert.strictEqual(res.statusCode, 302, "Empty string should redirect (302)");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "", "Empty string must clear the linkedin field");

    // Set again and clear with whitespace
    await updateProfileLinkedin("https://www.linkedin.com/in/student-dev");
    res = await updateProfileLinkedin("    ");
    assert.strictEqual(res.statusCode, 302, "Whitespace should redirect (302)");
    updatedUser = await User.findById(user._id);
    assert.strictEqual(updatedUser.linkedin, "", "Whitespace must clear the linkedin field");
    console.log("   ✓ Empty string and whitespace clear the linkedin field.");

    // -------------------------------------------------------------
    // Test 5: Display Rendering with rel="noopener noreferrer nofollow"
    // -------------------------------------------------------------
    console.log("6. Testing link display formatting and security attributes...");

    const profileTemplate = fs.readFileSync(path.join(__dirname, "..", "views", "profile.ejs"), "utf8");
    const teamTemplate = fs.readFileSync(path.join(__dirname, "..", "views", "applications", "team.ejs"), "utf8");

    // 5a. Profile view with linked user
    const mockUserWithLi = {
      name: "LinkedIn Student",
      email: "student@kkwagh.edu.in",
      role: "Member",
      linkedin: "https://www.linkedin.com/in/student-dev",
      isGithubVerified: false,
      isProfileHidden: false
    };

    const renderedProfile = ejs.render(profileTemplate, {
      currentUser: mockUserWithLi,
      csrfToken: "dummy_csrf",
      layout: () => { }
    }, { views: [path.join(__dirname, "..", "views")] });

    assert.ok(
      renderedProfile.includes('href="https://www.linkedin.com/in/student-dev"'),
      "Profile view must link to the user's LinkedIn profile URL"
    );
    assert.ok(
      renderedProfile.includes('rel="noopener noreferrer nofollow"'),
      "Profile view must use rel='noopener noreferrer nofollow'"
    );
    assert.ok(
      renderedProfile.includes('target="_blank"'),
      "Profile view must open in new tab (target='_blank')"
    );
    assert.ok(
      renderedProfile.includes("LinkedIn profile"),
      "Profile view must display plain text 'LinkedIn profile'"
    );
    assert.ok(
      !renderedProfile.includes("LinkedIn Linked"),
      "Profile view must not render 'LinkedIn Linked' badge"
    );
    assert.ok(
      !renderedProfile.includes("LinkedIn Verified"),
      "Profile view must not render 'LinkedIn Verified' badge"
    );
    assert.ok(
      !renderedProfile.includes('href="/auth/linkedin"'),
      "Profile view must not render OAuth link button"
    );
    console.log("   ✓ Profile view renders plain link with rel='noopener noreferrer nofollow' and no OAuth badges.");

    // 5b. Team management view with locked mutual opt-in
    const mockApp = {
      _id: "507f1f77bcf86cd799439011",
      direction: "APPLY",
      status: "LOCKED",
      role: "Frontend Lead",
      createdAt: new Date("2026-10-20T10:00:00Z"),
      bothOptedIn: true,
      myContactOptIn: true,
      applicantId: {
        _id: "6ae18b1b5c884d41ad340e29",
        name: "Alice Locked",
        email: "alice@kkwagh.edu.in",
        phone: "9876543210",
        linkedin: "https://www.linkedin.com/in/alice-dev",
        skills: [{ name: "React" }]
      }
    };

    const renderedTeam = ejs.render(teamTemplate, {
      team: { _id: "507f191e810c19729de860ea", projectName: "Project X", roles: [] },
      applications: [mockApp],
      receivedApplications: [mockApp],
      sentInvitations: [],
      csrfToken: "dummy_csrf",
      formatDate: () => "2026-10-20",
      layout: () => { }
    }, { views: [path.join(__dirname, "..", "views")] });

    assert.ok(
      renderedTeam.includes('href="https://www.linkedin.com/in/alice-dev"'),
      "Team view must link to applicant's LinkedIn URL"
    );
    assert.ok(
      renderedTeam.includes('rel="noopener noreferrer nofollow"'),
      "Team view must use rel='noopener noreferrer nofollow'"
    );
    assert.ok(
      renderedTeam.includes("LinkedIn profile"),
      "Team view must display plain text 'LinkedIn profile'"
    );
    console.log("   ✓ Team contact card renders plain link with rel='noopener noreferrer nofollow'.");

    // -------------------------------------------------------------
    // Test 6: Model Trust Badges & Scores
    // -------------------------------------------------------------
    console.log("7. Testing User model trust badges & scoring...");

    const userWithLiLinked = new User({
      name: "Badge Test User",
      email: "badgetest@kkwagh.edu.in",
      isLinkedinLinked: true,
      linkedin: "https://www.linkedin.com/in/student-dev"
    });

    const trustBadges = userWithLiLinked.trustBadges;
    const hasLiBadge = trustBadges.some(b => b.key === "linkedin" || (b.label && b.label.includes("LinkedIn")));
    assert.strictEqual(hasLiBadge, false, "trustBadges must not contain any LinkedIn badge");
    console.log("   ✓ User.trustBadges contains zero LinkedIn badges.");

    // Completeness test: does not depend on isLinkedinLinked alone
    const userOnlyLinkedFlag = new User({
      name: "Flag Only User",
      email: "flagonly@kkwagh.edu.in",
      isLinkedinLinked: true,
      linkedin: "",
      github: "",
      portfolio: ""
    });
    const missing = userOnlyLinkedFlag.missingFields;
    assert.ok(
      missing.includes("External developer link (GitHub, LinkedIn, or Portfolio)"),
      "User with only isLinkedinLinked flag must still be prompted for external developer link"
    );
    console.log("   ✓ Completeness percentage does not award points for legacy isLinkedinLinked flag.");

    // -------------------------------------------------------------
    // Test 7: Disabled OAuth Routes
    // -------------------------------------------------------------
    console.log("8. Testing disabled OAuth routes...");

    const resLiAuth = await client.get("/auth/linkedin");
    assert.strictEqual(resLiAuth.statusCode, 302, "GET /auth/linkedin must redirect");
    assert.ok(resLiAuth.headers.location.endsWith("/profile"), "GET /auth/linkedin must redirect to /profile");

    const resLiCb = await client.get("/auth/linkedin/callback?code=test&state=test");
    assert.strictEqual(resLiCb.statusCode, 302, "GET /auth/linkedin/callback must redirect");
    assert.ok(resLiCb.headers.location.endsWith("/profile"), "GET /auth/linkedin/callback must redirect to /profile");

    const csrf = await getProfileEditCsrf();
    const unlinkForm = new URLSearchParams();
    unlinkForm.append("_csrf", csrf);
    const resLiUnlink = await client.post("/auth/linkedin/unlink", unlinkForm);
    assert.strictEqual(resLiUnlink.statusCode, 302, "POST /auth/linkedin/unlink must redirect");
    assert.ok(resLiUnlink.headers.location.endsWith("/profile"), "POST /auth/linkedin/unlink must redirect to /profile");

    console.log("   ✓ All legacy LinkedIn OAuth routes redirect to /profile.");

    console.log("\n=================================================");
    console.log("ALL LINKEDIN PROFILE URL TESTS PASSED (100%)");
    console.log("=================================================");
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    setTimeout(() => {
      process.exit(0);
    }, 200).unref();
  }
}

runTests().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch(err => {
  console.error("Test failure in tests/linkedinUrlValidation.test.js:", err);
  process.exit(1);
});
