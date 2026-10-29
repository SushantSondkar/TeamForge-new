/**
 * tests/profileSave.test.js
 * 
 * Regression Test Suite for Profile Edit & Saving:
 * 1. Log in as a student user.
 * 2. Verify initial /profile shows empty states for bio, skills, projects, and hackathons.
 * 3. POST /profile/edit with:
 *    - Bio (>= 10 characters)
 *    - 3 Technical Skills (with levels)
 *    - 1 Project (title, description, link, techStack)
 *    - 1 Past Hackathon (name, year, projectTitle, role, placement)
 * 4. GET /profile and assert all four sections appear and completeness percentage increases.
 * 5. Verify validation: Bio < 10 chars rejected with 400 and preserves typed inputs.
 * 6. Verify array/object structure compatibility for projects and pastHackathons.
 */

const assert = require("assert");
const http = require("http");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "profile_save_test_session_secret_32_chars";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "profile_save_test_cookie_secret_32_chars";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "profile_save_test_csrf_secret_32_chars";

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

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  request(options, postBody) {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path, this.baseUrl);
      const reqOpts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || "GET",
        headers: {
          Cookie: this.getCookieString(),
          ...(options.headers || {})
        }
      };

      if (postBody) {
        reqOpts.headers["Content-Length"] = Buffer.byteLength(postBody);
      }

      const req = http.request(reqOpts, (res) => {
        this.updateCookies(res.headers["set-cookie"]);
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on("error", reject);

      if (postBody) {
        req.write(postBody);
      }
      req.end();
    });
  }

  get(path) {
    return this.request({ method: "GET", path });
  }

  post(path, bodyData, isJson = false) {
    const contentType = isJson
      ? "application/json"
      : "application/x-www-form-urlencoded";
    const postBody = isJson
      ? JSON.stringify(bodyData)
      : (typeof bodyData === "string" ? bodyData : bodyData.toString());
    return this.request(
      {
        method: "POST",
        path,
        headers: { "Content-Type": contentType }
      },
      postBody
    );
  }

  async login(email, password) {
    const loginPage = await this.get("/login");
    const match = loginPage.body.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrfToken = match ? match[1] : "";

    const formData = new URLSearchParams();
    formData.append("_csrf", csrfToken);
    formData.append("email", email);
    formData.append("password", password);

    const res = await this.post("/login", formData);
    return res;
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PROFILE SAVE & EDIT REGRESSION TEST SUITE");
  console.log("=================================================\n");

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = new SessionClient(baseUrl);

  try {
    // 1. Seed fresh test student
    console.log("1. Seeding fresh test student...");
    const hashedPassword = await bcrypt.hash("Password123!", 10);
    const testEmail = "profilesave_test@kkwagh.edu.in";
    await User.deleteMany({ email: testEmail });

    const student = await User.create({
      name: "Profile Test Student",
      email: testEmail,
      password: hashedPassword,
      department: "Computer Engineering",
      year: "TE",
      role: "Candidate",
      isEmailVerified: true
    });

    console.log(`   ✓ Seeded student user: ${student._id}`);

    // 2. Log in as student
    console.log("\n2. Logging in as student user...");
    const loginRes = await client.login(testEmail, "Password123!");
    assert.strictEqual(loginRes.statusCode, 302, "Login must redirect (302)");
    console.log("   ✓ Student successfully logged in.");

    // 3. Inspect initial /profile state
    console.log("\n3. Inspecting initial /profile state...");
    const initialProfileRes = await client.get("/profile");
    assert.strictEqual(initialProfileRes.statusCode, 200);
    assert.ok(initialProfileRes.body.includes("No bio added yet"), "Initial profile must show 'No bio added yet'");
    assert.ok(initialProfileRes.body.includes("0 Skills Added"), "Initial profile must show '0 Skills Added'");
    assert.ok(initialProfileRes.body.includes("No projects added yet"), "Initial profile must show 'No projects added yet'");
    assert.ok(initialProfileRes.body.includes("No past hackathons listed yet"), "Initial profile must show 'No past hackathons listed yet'");

    // Initial completeness percentage (name/email + dept/year = 35%)
    const initialUser = await User.findById(student._id);
    const initialPct = initialUser.completenessPercentage;
    console.log(`   ✓ Initial profile completeness: ${initialPct}%`);

    // 4. Extract CSRF token from /profile/edit
    console.log("\n4. Fetching /profile/edit form and CSRF token...");
    const editPageRes = await client.get("/profile/edit");
    assert.strictEqual(editPageRes.statusCode, 200);
    const csrfMatch = editPageRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, "Must find CSRF token in /profile/edit");
    const csrfToken = csrfMatch[1];

    // 5. POST /profile/edit with bio, 3 skills, 1 project, and 1 past hackathon
    console.log("\n5. Submitting profile edit form with all 4 sections...");
    const formData = new URLSearchParams();
    formData.append("_csrf", csrfToken);
    formData.append("name", "Profile Test Student");
    formData.append("role", "Fullstack Engineer");
    formData.append("department", "Computer Engineering");
    formData.append("year", "TE");
    formData.append("bio", "Experienced fullstack engineer passionate about scalable campus software and building AI solutions.");
    formData.append("skills", "React:5, Node.js:4, MongoDB:4");
    formData.append("projectsRaw", "Campus Connect | Platform for peer hackathons | https://github.com/my/project | React, Node.js, MongoDB");
    formData.append("pastHackathonsRaw", "Smart India Hackathon | 2025 | AI Traffic Router | Lead Developer | 1st Place Winner");

    const saveRes = await client.post("/profile/edit", formData);
    assert.strictEqual(saveRes.statusCode, 302, "Profile save must redirect to /profile (302)");

    // 6. Verify /profile shows all 4 updated sections and higher completeness
    console.log("\n6. Verifying /profile renders all 4 sections and completeness increased...");
    const updatedProfileRes = await client.get("/profile");
    assert.strictEqual(updatedProfileRes.statusCode, 200);

    // Assert Bio
    assert.ok(
      updatedProfileRes.body.includes("Experienced fullstack engineer passionate about scalable campus software and building AI solutions."),
      "Bio text must be rendered in /profile"
    );
    assert.strictEqual(
      updatedProfileRes.body.includes("No bio added yet"),
      false,
      "'No bio added yet' must NOT appear when bio is present"
    );

    // Assert Skills
    assert.ok(updatedProfileRes.body.includes("3 Skills Added"), "/profile must show '3 Skills Added'");
    assert.ok(updatedProfileRes.body.includes("React"), "/profile must show 'React'");
    assert.ok(updatedProfileRes.body.includes("Lv 5"), "/profile must show 'Lv 5'");
    assert.ok(updatedProfileRes.body.includes("Node.js"), "/profile must show 'Node.js'");
    assert.ok(updatedProfileRes.body.includes("Lv 4"), "/profile must show 'Lv 4'");
    assert.ok(updatedProfileRes.body.includes("MongoDB"), "/profile must show 'MongoDB'");

    // Assert Projects
    assert.ok(updatedProfileRes.body.includes("Campus Connect"), "/profile must show project title 'Campus Connect'");
    assert.ok(updatedProfileRes.body.includes("Platform for peer hackathons"), "/profile must show project description");
    assert.ok(updatedProfileRes.body.includes("https://github.com/my/project"), "/profile must show project link");
    assert.strictEqual(
      updatedProfileRes.body.includes("No projects added yet"),
      false,
      "'No projects added yet' must NOT appear"
    );

    // Assert Past Hackathons
    assert.ok(updatedProfileRes.body.includes("Smart India Hackathon"), "/profile must show hackathon name");
    assert.ok(updatedProfileRes.body.includes("AI Traffic Router"), "/profile must show hackathon project title");
    assert.ok(updatedProfileRes.body.includes("1st Place Winner"), "/profile must show placement");
    assert.strictEqual(
      updatedProfileRes.body.includes("No past hackathons listed yet"),
      false,
      "'No past hackathons listed yet' must NOT appear"
    );

    // Assert Completeness Increase
    const updatedUser = await User.findById(student._id);
    const updatedPct = updatedUser.completenessPercentage;
    console.log(`   ✓ Completeness percentage increased from ${initialPct}% to ${updatedPct}%!`);
    assert.ok(
      updatedPct > initialPct,
      `Completeness must increase: expected > ${initialPct}%, got ${updatedPct}%`
    );

    // 7. Test Bio < 10 chars validation error and retaining input
    console.log("\n7. Testing Bio < 10 chars validation error (never fails silently)...");
    const freshEditRes = await client.get("/profile/edit");
    const freshCsrfMatch = freshEditRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    const freshCsrf = freshCsrfMatch[1];

    const shortBioForm = new URLSearchParams();
    shortBioForm.append("_csrf", freshCsrf);
    shortBioForm.append("name", "Profile Test Student");
    shortBioForm.append("bio", "Too short"); // 9 chars < 10
    shortBioForm.append("skills", "React:5, Node.js:4, MongoDB:4");

    const shortBioRes = await client.post("/profile/edit", shortBioForm);
    assert.strictEqual(shortBioRes.statusCode, 400, "Bio < 10 chars must return 400 Bad Request");
    assert.ok(
      shortBioRes.body.includes("Bio must be at least 10 characters."),
      "Must show clear validation error banner"
    );
    assert.ok(
      shortBioRes.body.includes("Too short"),
      "Must retain what user typed in the bio field"
    );
    console.log("   ✓ Bio < 10 chars properly rejected with 400 and typed input retained on form.");

    // 8. Test JSON and Object Array payload support for projects & pastHackathons
    console.log("\n8. Testing Array/Object payload support for projects and hackathons...");
    const step8EditRes = await client.get("/profile/edit");
    const step8CsrfMatch = step8EditRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    const step8Csrf = step8CsrfMatch[1];

    const arrayForm = new URLSearchParams();
    arrayForm.append("_csrf", step8Csrf);
    arrayForm.append("name", "Profile Test Student");
    arrayForm.append("bio", "Valid bio with more than ten characters for array test.");
    arrayForm.append("projects[0][title]", "Array Project Alpha");
    arrayForm.append("projects[0][description]", "Built via urlencoded array");
    arrayForm.append("projects[0][link]", "https://github.com/test/alpha");
    arrayForm.append("pastHackathons[0][name]", "HackNashik 2026");
    arrayForm.append("pastHackathons[0][year]", "2026");
    arrayForm.append("pastHackathons[0][placement]", "Finalist");

    const arrayRes = await client.post("/profile/edit", arrayForm);
    assert.strictEqual(arrayRes.statusCode, 302, "Array-formatted payload must save and redirect");

    const userWithArrayData = await User.findById(student._id);
    assert.strictEqual(userWithArrayData.projects[0].title, "Array Project Alpha");
    assert.strictEqual(userWithArrayData.pastHackathons[0].name, "HackNashik 2026");
    console.log("   ✓ Array/Object notation for projects and hackathons successfully parsed and persisted.");

    console.log("\n=================================================");
    console.log("ALL PROFILE SAVE & EDIT REGRESSION TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    server.close();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Profile save tests failed:", err);
    process.exit(1);
  });
