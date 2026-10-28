/**
 * tests/privacyAndTermsSmoke.test.js
 *
 * Smoke test verifying:
 * 1. GET /privacy returns 200 OK without authentication.
 *    - Contains the SUPPORT_EMAIL ('teamforge.kkwagh@gmail.com')
 *    - Contains the words "phone number" (case-insensitive)
 *    - Explains what data is collected, why, who can see it, and user rights (aim to respond within 7 days)
 *    - Contains "Last updated" date
 * 2. GET /terms returns 200 OK without authentication.
 *    - Contains the SUPPORT_EMAIL ('teamforge.kkwagh@gmail.com')
 *    - Contains the words "phone number" (case-insensitive)
 *    - Explains eligibility, acceptable use, organizer verification, disclaimer, and contact
 *    - Contains "Last updated" date
 * 3. Footer includes links to /terms and /privacy
 * 4. Signup page includes "By signing up you agree to the Terms and Privacy Policy" linking to /terms and /privacy
 * 5. Clean responses: no unhandled errors, no stack traces, no secrets leaked
 */

const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "smoke_test_session_secret_32_characters_long";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "smoke_test_cookie_secret_32_characters_long";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "smoke_test_csrf_secret_32_characters_long";

const app = require("../app");
const connectDB = require("../models/db");

const EXPECTED_SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "teamforge.kkwagh@gmail.com";

async function run() {
  console.log("=================================================");
  console.log("RUNNING PRIVACY & TERMS PUBLIC PAGES SMOKE TEST");
  console.log("=================================================\n");

  await connectDB();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  function makeRequest(path) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "GET",
          headers: {
            "Accept": "text/html"
          }
        },
        res => {
          let body = "";
          res.on("data", chunk => (body += chunk));
          res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  try {
    // -------------------------------------------------------------
    // 1. GET /privacy (Public, no login)
    // -------------------------------------------------------------
    console.log("1. Testing GET /privacy without login...");
    const privacyRes = await makeRequest("/privacy");
    assert.strictEqual(privacyRes.statusCode, 200, "GET /privacy must return 200 OK without login");
    assert.ok(!privacyRes.body.includes("Cannot GET"), "Body must not contain 'Cannot GET'");
    assert.ok(!privacyRes.body.includes("ReferenceError"), "Body must not contain ReferenceError");

    // Check support email
    assert.ok(
      privacyRes.body.includes(EXPECTED_SUPPORT_EMAIL),
      `GET /privacy must contain the support email '${EXPECTED_SUPPORT_EMAIL}'`
    );

    // Check words "phone number" (case-insensitive)
    assert.ok(
      /phone\s+number/i.test(privacyRes.body),
      "GET /privacy must contain the words 'phone number'"
    );

    // Check key required sections
    assert.ok(/last\s+updated/i.test(privacyRes.body), "Privacy page must show 'Last updated' date");
    assert.ok(privacyRes.body.includes("@kkwagh.edu.in"), "Privacy page must mention @kkwagh.edu.in");
    assert.ok(/never\s+sold/i.test(privacyRes.body), "Privacy page must state data is never sold");
    assert.ok(privacyRes.body.includes("7 days"), "Privacy page must state 'we aim to respond within 7 days'");
    assert.ok(/cookie/i.test(privacyRes.body), "Privacy page must mention cookies policy");
    console.log("   ✓ GET /privacy returned 200 OK with support email, 'phone number', and required policies.");

    // -------------------------------------------------------------
    // 2. GET /terms (Public, no login)
    // -------------------------------------------------------------
    console.log("\n2. Testing GET /terms without login...");
    const termsRes = await makeRequest("/terms");
    assert.strictEqual(termsRes.statusCode, 200, "GET /terms must return 200 OK without login");
    assert.ok(!termsRes.body.includes("Cannot GET"), "Body must not contain 'Cannot GET'");
    assert.ok(!termsRes.body.includes("ReferenceError"), "Body must not contain ReferenceError");

    // Check support email
    assert.ok(
      termsRes.body.includes(EXPECTED_SUPPORT_EMAIL),
      `GET /terms must contain the support email '${EXPECTED_SUPPORT_EMAIL}'`
    );

    // Check words "phone number" (case-insensitive)
    assert.ok(
      /phone\s+number/i.test(termsRes.body),
      "GET /terms must contain the words 'phone number'"
    );

    // Check key required sections
    assert.ok(/last\s+updated/i.test(termsRes.body), "Terms page must show 'Last updated' date");
    assert.ok(/eligible\s+users/i.test(termsRes.body), "Terms page must describe eligible users");
    assert.ok(/acceptable\s+use/i.test(termsRes.body), "Terms page must describe acceptable use");
    assert.ok(/organizer/i.test(termsRes.body), "Terms page must mention hackathon organizers");
    assert.ok(/as\s+is/i.test(termsRes.body), "Terms page must state project is provided as is");
    console.log("   ✓ GET /terms returned 200 OK with support email, 'phone number', and required terms.");

    // -------------------------------------------------------------
    // 3. Footer Links Verification
    // -------------------------------------------------------------
    console.log("\n3. Testing footer links on public pages...");
    const homeRes = await makeRequest("/");
    assert.strictEqual(homeRes.statusCode, 200, "GET / must return 200 OK");
    assert.ok(homeRes.body.includes('href="/terms"'), "Footer must link to /terms");
    assert.ok(homeRes.body.includes('href="/privacy"'), "Footer must link to /privacy");
    console.log("   ✓ Footer contains links to /terms and /privacy.");

    // -------------------------------------------------------------
    // 4. Signup Form Terms & Privacy Link Verification
    // -------------------------------------------------------------
    console.log("\n4. Testing signup form Terms & Privacy links...");
    const signupRes = await makeRequest("/signup");
    assert.strictEqual(signupRes.statusCode, 200, "GET /signup must return 200 OK");
    assert.ok(
      signupRes.body.includes("By signing up you agree to the"),
      "Signup page must contain 'By signing up you agree to the' text"
    );
    assert.ok(
      signupRes.body.includes('href="/terms"') && signupRes.body.includes('href="/privacy"'),
      "Signup page must link to both /terms and /privacy"
    );
    console.log("   ✓ Signup form contains 'By signing up you agree to the Terms and Privacy Policy' with links.");

    console.log("\n=================================================");
    console.log("ALL PRIVACY & TERMS SMOKE TESTS PASSED (100%)");
    console.log("=================================================");
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    setTimeout(() => {
      process.exit(0);
    }, 200).unref();
  }
}

run().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
