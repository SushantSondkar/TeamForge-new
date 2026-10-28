/**
 * tests/feedbackAndProblemReport.test.js
 *
 * Verifies:
 * 1. Referrer-Policy response header is "same-origin".
 * 2. GET to /feedback with a same-site Referer (/discover) followed by POST (Referer /feedback) saves pageUrl "/discover".
 * 3. GET to /feedback with external Referer saves pageUrl "".
 * 4. POST to /feedback without prior GET saves pageUrl "".
 * 5. Page reloads/error re-renders with Referer /feedback preserve the session's feedbackFromPath.
 * 6. Missing/invalid rating rejected for normal feedback, accepted for type=problem with category "bug".
 * 7. Admin page with a mix of rated and unrated entries shows the correct average (counting only rated entries) and no NaN/undefined/null text.
 * 8. Admin star display shows "No rating" for unrated entries.
 * 9. CSV export has empty rating cell for unrated entries, and includes Page URL and Status.
 * 10. Student receives 403 on resolve endpoint; admin can resolve feedback.
 */

const assert = require("assert");
const http = require("http");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "feedback_test_session_secret_32_chars_long";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "feedback_test_cookie_secret_32_chars_long";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "feedback_test_csrf_secret_32_chars_long";

const app = require("../app");
const connectDB = require("../models/db");
const mongoose = require("mongoose");
const User = require("../models/User");
const Feedback = require("../models/Feedback");

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

  async get(pathname, headers = {}) {
    return this.request(pathname, { method: "GET", headers });
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

  async fetchCsrf(pathname = "/feedback") {
    const res = await this.get(pathname);
    assert.strictEqual(res.statusCode, 200, `GET ${pathname} should return 200`);
    const match = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(match, `Must find CSRF token in ${pathname}`);
    return match[1];
  }

  async login(email, password) {
    const resGet = await this.get("/login");
    assert.strictEqual(resGet.statusCode, 200, "GET /login must return 200");
    const csrfMatch = resGet.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, "Must find CSRF token in /login");
    const csrfToken = csrfMatch[1];

    const formData = new URLSearchParams();
    formData.append("_csrf", csrfToken);
    formData.append("email", email);
    formData.append("password", password);

    const resPost = await this.post("/login", formData);
    assert.strictEqual(resPost.statusCode, 302, "POST /login must redirect on auth");
    return csrfToken;
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING FEEDBACK & PROBLEM REPORTING TESTS");
  console.log("=================================================\n");

  await connectDB();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);

    const studentUser = await User.create({
      name: "Normal Student User",
      email: "student_fb@kkwagh.edu.in",
      password: passwordHash,
      department: "Computer Engineering",
      year: "Third Year",
      isEmailVerified: true,
      isAdmin: false
    });

    const adminUser = await User.create({
      name: "Campus Admin User",
      email: "admin_fb@kkwagh.edu.in",
      password: passwordHash,
      department: "Information Technology",
      year: "Fourth Year",
      isEmailVerified: true,
      isAdmin: true
    });

    // Clean previous feedbacks
    await Feedback.deleteMany({});

    // -------------------------------------------------------------
    // Test 1: Referrer-Policy header check
    // -------------------------------------------------------------
    console.log("1. Testing Referrer-Policy response header is 'same-origin'...");
    const guestClient = new SessionClient(baseUrl);
    const rootRes = await guestClient.get("/");
    assert.strictEqual(
      rootRes.headers["referrer-policy"],
      "same-origin",
      `Referrer-Policy header must be 'same-origin', got '${rootRes.headers["referrer-policy"]}'`
    );
    console.log("   ✓ Referrer-Policy header is correctly set to 'same-origin'.");

    // -------------------------------------------------------------
    // Test 2: GET /feedback with same-site Referer (/discover) followed by POST saves pageUrl "/discover"
    // -------------------------------------------------------------
    console.log("2. Testing GET with same-site Referer (/discover) followed by POST (Referer /feedback)...");
    const clientSameSite = new SessionClient(baseUrl);
    const getRes1 = await clientSameSite.get("/feedback", {
      "Referer": `${baseUrl}/discover?search=python#top`
    });
    assert.strictEqual(getRes1.statusCode, 200);
    const csrf1 = getRes1.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];

    const form1 = new URLSearchParams();
    form1.append("_csrf", csrf1);
    form1.append("rating", "4");
    form1.append("category", "general");
    form1.append("comment", "Great platform for finding hackathon teammates!");

    const postRes1 = await clientSameSite.post("/feedback", form1, {
      "Referer": `${baseUrl}/feedback`
    });
    assert.strictEqual(postRes1.statusCode, 302, "POST /feedback must redirect on success");

    const saved1 = await Feedback.findOne({ comment: "Great platform for finding hackathon teammates!" });
    assert.ok(saved1, "Feedback must be saved in database");
    assert.strictEqual(saved1.rating, 4, "Rating must be 4");
    assert.strictEqual(saved1.category, "general", "Category must be general");
    assert.strictEqual(saved1.pageUrl, "/discover", "pageUrl must be /discover stored from GET session");
    assert.strictEqual(saved1.status, "new", "Status must default to 'new'");
    console.log("   ✓ GET /feedback with same-site Referer saved pageUrl '/discover' into session and used on POST.");

    // -------------------------------------------------------------
    // Test 3: GET with external Referer saves pageUrl ""
    // -------------------------------------------------------------
    console.log("3. Testing GET with external Referer saves empty pageUrl...");
    const clientExternal = new SessionClient(baseUrl);
    const getRes2 = await clientExternal.get("/feedback", {
      "Referer": "https://malicious-external-site.com/steal-data?evil=1#phish"
    });
    assert.strictEqual(getRes2.statusCode, 200);
    const csrf2 = getRes2.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];

    const form2 = new URLSearchParams();
    form2.append("_csrf", csrf2);
    form2.append("rating", "5");
    form2.append("category", "feature_request");
    form2.append("comment", "Add dark mode please");

    const postRes2 = await clientExternal.post("/feedback", form2, {
      "Referer": `${baseUrl}/feedback`
    });
    assert.strictEqual(postRes2.statusCode, 302);

    const saved2 = await Feedback.findOne({ comment: "Add dark mode please" });
    assert.ok(saved2, "Feedback must be saved");
    assert.strictEqual(saved2.pageUrl, "", "External Referer must result in empty string pageUrl");
    console.log("   ✓ GET with external Referer saved empty pageUrl in session.");

    // -------------------------------------------------------------
    // Test 4: POST without prior GET saves pageUrl ""
    // -------------------------------------------------------------
    console.log("4. Testing POST without prior GET saves empty pageUrl...");
    const clientNoGet = new SessionClient(baseUrl);
    // Obtain CSRF token from /login instead of /feedback
    const resLogin = await clientNoGet.get("/login");
    const csrfNoGet = resLogin.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];

    const formNoGet = new URLSearchParams();
    formNoGet.append("_csrf", csrfNoGet);
    formNoGet.append("rating", "3");
    formNoGet.append("category", "general");
    formNoGet.append("comment", "Submitting POST directly without calling GET /feedback");

    const postResNoGet = await clientNoGet.post("/feedback", formNoGet, {
      "Referer": `${baseUrl}/login`
    });
    assert.strictEqual(postResNoGet.statusCode, 302);

    const savedNoGet = await Feedback.findOne({ comment: "Submitting POST directly without calling GET /feedback" });
    assert.ok(savedNoGet);
    assert.strictEqual(savedNoGet.pageUrl, "", "POST without prior GET must store empty pageUrl");
    console.log("   ✓ POST without prior GET to /feedback stored empty pageUrl.");

    // -------------------------------------------------------------
    // Test 5: Missing or invalid rating rejected for normal feedback
    // -------------------------------------------------------------
    console.log("5. Testing missing/invalid rating rejected for normal feedback...");
    const clientValidation = new SessionClient(baseUrl);
    const csrfVal1 = await clientValidation.fetchCsrf("/feedback");

    // Omitted rating for normal feedback
    const formMissing = new URLSearchParams();
    formMissing.append("_csrf", csrfVal1);
    formMissing.append("category", "general");
    formMissing.append("comment", "Trying to submit without rating");

    const resMissing = await clientValidation.post("/feedback", formMissing);
    assert.strictEqual(resMissing.statusCode, 400, "Normal feedback without rating must return 400");
    assert.ok(resMissing.body.includes("Please choose a rating"), "Must return error message in page");
    assert.ok(resMissing.body.includes("Trying to submit without rating"), "Must preserve typed comment");

    // Invalid rating for normal feedback (e.g. 9 stars)
    const csrfVal2 = await clientValidation.fetchCsrf("/feedback");
    const formInvalid = new URLSearchParams();
    formInvalid.append("_csrf", csrfVal2);
    formInvalid.append("rating", "9");
    formInvalid.append("category", "general");
    formInvalid.append("comment", "Invalid rating 9");

    const resInvalid = await clientValidation.post("/feedback", formInvalid);
    assert.strictEqual(resInvalid.statusCode, 400, "Normal feedback with invalid rating must return 400");
    assert.ok(resInvalid.body.includes("Please provide a valid rating from 1 to 5 stars"), "Must return error message");
    console.log("   ✓ Missing or invalid rating rejected for normal feedback.");

    // -------------------------------------------------------------
    // Test 6: Problem report (type=problem) accepted with category "bug" without rating
    // -------------------------------------------------------------
    console.log("6. Testing type=problem accepted without rating with category 'bug'...");
    const clientProblem = new SessionClient(baseUrl);
    const getResProblem = await clientProblem.get("/feedback?type=problem", {
      "Referer": `${baseUrl}/teams/bytecraft`
    });
    assert.strictEqual(getResProblem.statusCode, 200);
    const csrfProblem = getResProblem.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];

    const formProblem = new URLSearchParams();
    formProblem.append("_csrf", csrfProblem);
    formProblem.append("type", "problem");
    formProblem.append("comment", "Button on /teams/bytecraft is not responding to clicks");

    const resProblem = await clientProblem.post("/feedback", formProblem, {
      "Referer": `${baseUrl}/feedback?type=problem`
    });
    assert.strictEqual(resProblem.statusCode, 302, "Problem report without rating must succeed and redirect");

    const savedProblem = await Feedback.findOne({ comment: "Button on /teams/bytecraft is not responding to clicks" });
    assert.ok(savedProblem, "Problem report must be saved");
    assert.strictEqual(savedProblem.rating, null, "Problem report without rating stores rating null");
    assert.strictEqual(savedProblem.category, "bug", "Problem report defaults to category 'bug'");
    assert.strictEqual(savedProblem.pageUrl, "/teams/bytecraft", "pageUrl correctly captured from GET session");
    assert.strictEqual(savedProblem.status, "new", "Status must be 'new'");
    console.log("   ✓ Problem report saved with category 'bug', rating null, and status 'new'.");

    // -------------------------------------------------------------
    // Test 7: Page reload or error re-render with Referer /feedback keeps session feedbackFromPath
    // -------------------------------------------------------------
    console.log("7. Testing page reload with Referer /feedback preserves session path...");
    const clientReload = new SessionClient(baseUrl);
    // Initial visit from /events
    await clientReload.get("/feedback", { "Referer": `${baseUrl}/events` });
    // Reload page (Referer is now /feedback)
    const reloadRes = await clientReload.get("/feedback", { "Referer": `${baseUrl}/feedback` });
    const reloadCsrf = reloadRes.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];

    const formReload = new URLSearchParams();
    formReload.append("_csrf", reloadCsrf);
    formReload.append("rating", "5");
    formReload.append("category", "general");
    formReload.append("comment", "Preserved session path after reload");

    await clientReload.post("/feedback", formReload, { "Referer": `${baseUrl}/feedback` });
    const savedReload = await Feedback.findOne({ comment: "Preserved session path after reload" });
    assert.ok(savedReload);
    assert.strictEqual(savedReload.pageUrl, "/events", "pageUrl preserved across page reload");
    console.log("   ✓ Session path preserved when Referer is /feedback.");

    // -------------------------------------------------------------
    // Test 8: Normal student cannot access resolve endpoint (403 Forbidden)
    // -------------------------------------------------------------
    console.log("8. Testing normal student cannot call resolve endpoint (403)...");
    const studentClient = new SessionClient(baseUrl);
    await studentClient.login("student_fb@kkwagh.edu.in", "Password123!");

    const studentCsrf = await studentClient.fetchCsrf("/feedback");

    const formResolveStudent = new URLSearchParams();
    formResolveStudent.append("_csrf", studentCsrf);

    const resResolveStudent = await studentClient.post(`/admin/feedback/${saved1._id}/resolve`, formResolveStudent);
    assert.strictEqual(resResolveStudent.statusCode, 403, "Normal student must be blocked with 403 Forbidden");

    const checkNotResolved = await Feedback.findById(saved1._id);
    assert.strictEqual(checkNotResolved.status, "new", "Status must remain 'new' after unauthorized attempt");
    console.log("   ✓ Normal student blocked from resolving feedback with 403.");

    // -------------------------------------------------------------
    // Test 9: Admin can call resolve endpoint and status changes to "resolved"
    // -------------------------------------------------------------
    console.log("9. Testing admin can call resolve endpoint and change status to 'resolved'...");
    const adminClient = new SessionClient(baseUrl);
    await adminClient.login("admin_fb@kkwagh.edu.in", "Password123!");

    const adminCsrf = await adminClient.fetchCsrf("/admin/feedback");

    const formResolveAdmin = new URLSearchParams();
    formResolveAdmin.append("_csrf", adminCsrf);

    const resResolveAdmin = await adminClient.post(`/admin/feedback/${saved1._id}/resolve`, formResolveAdmin);
    assert.strictEqual(resResolveAdmin.statusCode, 302, "Admin resolve must redirect to /admin/feedback");

    const checkResolved = await Feedback.findById(saved1._id);
    assert.strictEqual(checkResolved.status, "resolved", "Status must be updated to 'resolved'");
    console.log("   ✓ Admin successfully marked feedback as 'resolved'.");

    // -------------------------------------------------------------
    // Test 10: Admin page with mix of rated and unrated entries shows correct average & no NaN/null/undefined
    // -------------------------------------------------------------
    console.log("10. Testing admin page with mix of rated and unrated entries...");
    // Current database has:
    // saved1: rating 4
    // saved2: rating 5
    // savedNoGet: rating 3
    // savedProblem: rating null
    // savedReload: rating 5
    // Rated entries: 4, 5, 3, 5 -> Sum = 17, Count = 4 -> Average = 17 / 4 = 4.25
    const adminPanelRes = await adminClient.get("/admin/feedback");
    assert.strictEqual(adminPanelRes.statusCode, 200, "Admin feedback panel must load 200 OK");
    assert.ok(adminPanelRes.body.includes("4.25 / 5.0"), "Average rating must strictly ignore unrated entries and compute 4.25 / 5.0");
    assert.ok(adminPanelRes.body.includes("No rating"), "Unrated problem report shows 'No rating'");
    assert.strictEqual(adminPanelRes.body.includes("NaN"), false, "Admin page must not contain NaN");
    assert.strictEqual(adminPanelRes.body.includes("undefined"), false, "Admin page must not contain undefined");
    assert.strictEqual(adminPanelRes.body.includes(">null<"), false, "Admin page must not render null as text");

    // Check CSV Export
    const csvRes = await adminClient.get("/admin/feedback/export");
    assert.strictEqual(csvRes.statusCode, 200, "CSV export must return 200 OK");
    assert.ok(csvRes.body.includes('"Page URL"'), "CSV header must include Page URL column");
    assert.ok(csvRes.body.includes('"Status"'), "CSV header must include Status column");
    assert.ok(csvRes.body.includes('"/discover"'), "CSV rows must include pageUrl data");

    // Find problem report line in CSV and verify rating cell is empty
    const csvLines = csvRes.body.split("\r\n");
    const problemLine = csvLines.find(l => l.includes("Button on /teams/bytecraft"));
    assert.ok(problemLine, "CSV must contain problem report entry");
    // Format: "ID","Date","Rating","Category","Page URL","Status","Comment"
    // Rating cell must be ""
    assert.ok(problemLine.includes(',"",'), "Rating cell in CSV for unrated problem report must be empty");

    console.log("   ✓ Admin panel correctly displays 4.25 average ignoring unrated entries.");
    console.log("   ✓ Zero NaN, undefined, or null text on admin page.");
    console.log("   ✓ CSV export contains empty rating cell for unrated entry.");

    console.log("\n=================================================");
    console.log("ALL FEEDBACK & PROBLEM REPORT TESTS PASSED (100%)");
    console.log("=================================================");
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error("Test failure:", err);
    process.exit(1);
  });
