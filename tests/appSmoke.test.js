/**
 * tests/appSmoke.test.js
 * 
 * Smoke test suite for TeamForge Express application:
 * 1. Dynamically requires every file in routes/ to detect any syntax/import errors.
 * 2. Starts the real Express app from app.js on a random free port with USE_MEMORY_DB=true.
 * 3. Probes real HTTP requests via Node's built-in http module (zero external test dependencies):
 *    - GET /healthz returns 200.
 *    - GET /, /login, /signup, /how-it-works, /forgot-password return 200.
 *    - GET /dashboard, /discover, /profile, /notifications, /leaderboard, /events, /admin/stats
 *      without login redirect to /login or return 401/403 (never 200 and never 500).
 *    - GET /events/<24-hex-id> and /events/not-an-id without login redirect to /login (302).
 *    - GET /does-not-exist returns the 404 page.
 *    - Response bodies contain no "Cannot GET", no "stack", and no server file paths.
 */

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("RUNNING APP SMOKE TEST SUITE (EXPRESS & HTTP)");
console.log("=================================================\n");

// -------------------------------------------------------------
// Step 1: Require every file in routes/ and fail with filename if any throws
// -------------------------------------------------------------
console.log("1. Verifying all route files in routes/ load without errors...");
const routesDir = path.resolve(__dirname, "../routes");
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith(".js"));

for (const file of routeFiles) {
  try {
    const routePath = path.join(routesDir, file);
    require(routePath);
    console.log(`   ✓ Loaded routes/${file}`);
  } catch (err) {
    console.error(`   ❌ Failed to load routes/${file}:`, err);
    throw new Error(`Syntax or initialization error in routes/${file}: ${err.message}`);
  }
}
console.log("   ✓ All route modules required successfully.\n");

// Set test environment configuration
process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "smoke_test_session_secret_32_characters_long";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "smoke_test_cookie_secret_32_characters_long";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "smoke_test_csrf_secret_32_characters_long";

const app = require("../app");
const connectDB = require("../models/db");
const mongoose = require("mongoose");

async function runSmokeTests() {
  let server;
  try {
    // -------------------------------------------------------------
    // Step 2: Connect DB and start real Express app on a random port
    // -------------------------------------------------------------
    console.log("2. Connecting to in-memory database and starting Express app...");
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`   ✓ Express app listening on ephemeral port ${port}\n`);

    function makeRequest(pathname) {
      return new Promise((resolve, reject) => {
        http.get(`${baseUrl}${pathname}`, (res) => {
          let body = "";
          res.on("data", chunk => body += chunk);
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          });
        }).on("error", reject);
      });
    }

    function assertCleanBody(body, endpoint) {
      assert.ok(
        !body.includes("Cannot GET"),
        `Response body for ${endpoint} must not contain 'Cannot GET'`
      );
      assert.ok(
        !body.toLowerCase().includes("stack trace") && !body.toLowerCase().includes("at process.processticksandrejections"),
        `Response body for ${endpoint} must not contain stack traces`
      );
      assert.ok(
        !/([A-Za-z]:\\|\/home\/|\/Users\/)[^<>\r\n]+/i.test(body),
        `Response body for ${endpoint} must not leak server file paths`
      );
    }

    // -------------------------------------------------------------
    // Step 3: GET /healthz returns 200
    // -------------------------------------------------------------
    console.log("3. Testing GET /healthz...");
    const resHealthz = await makeRequest("/healthz");
    assert.strictEqual(resHealthz.statusCode, 200, "GET /healthz must return 200");
    assertCleanBody(resHealthz.body, "/healthz");
    console.log("   ✓ GET /healthz returned 200 OK.");

    // -------------------------------------------------------------
    // Step 4: GET /, /login, /signup, /how-it-works, /forgot-password return 200
    // -------------------------------------------------------------
    const publicEndpoints = ["/", "/login", "/signup", "/how-it-works", "/forgot-password"];
    console.log(`\n4. Testing public endpoints (${publicEndpoints.join(", ")})...`);
    for (const ep of publicEndpoints) {
      const res = await makeRequest(ep);
      assert.strictEqual(res.statusCode, 200, `GET ${ep} must return 200 OK, got ${res.statusCode}`);
      assertCleanBody(res.body, ep);
      console.log(`   ✓ GET ${ep} returned 200 OK.`);
    }

    // -------------------------------------------------------------
    // Step 5: Protected endpoints without login redirect to /login or return 401/403
    // (Never 200 and never 500)
    // -------------------------------------------------------------
    const protectedEndpoints = [
      "/dashboard",
      "/discover",
      "/profile",
      "/notifications",
      "/leaderboard",
      "/events",
      "/admin/stats"
    ];
    console.log(`\n5. Testing unauthenticated access to protected endpoints (${protectedEndpoints.join(", ")})...`);
    for (const ep of protectedEndpoints) {
      const res = await makeRequest(ep);
      assert.notStrictEqual(res.statusCode, 200, `GET ${ep} without login must NEVER return 200 OK`);
      assert.notStrictEqual(res.statusCode, 500, `GET ${ep} without login must NEVER return 500 Server Error`);

      const isRedirectToLogin = res.statusCode === 302 && res.headers.location && res.headers.location.includes("/login");
      const isAuthError = res.statusCode === 401 || res.statusCode === 403;
      assert.ok(
        isRedirectToLogin || isAuthError,
        `GET ${ep} without login must redirect to /login or return 401/403, got status ${res.statusCode} with location: ${res.headers.location}`
      );
      assertCleanBody(res.body, ep);
      console.log(`   ✓ GET ${ep} correctly guarded (Status: ${res.statusCode}, Location: ${res.headers.location || 'none'}).`);
    }

    // -------------------------------------------------------------
    // Step 5b: Event detail protection checks (over real HTTP without login)
    // -------------------------------------------------------------
    console.log("\n5b. Testing event detail protection without login (/events/:id)...");
    const validHexId = "507f1f77bcf86cd799439011";
    const resValidEventId = await makeRequest(`/events/${validHexId}`);
    assert.strictEqual(
      resValidEventId.statusCode,
      302,
      `GET /events/${validHexId} without login must redirect to /login (302), got ${resValidEventId.statusCode}`
    );
    assert.notStrictEqual(
      resValidEventId.statusCode,
      200,
      `GET /events/${validHexId} without login must NEVER return 200`
    );
    assert.ok(
      resValidEventId.headers.location && resValidEventId.headers.location.includes("/login"),
      `GET /events/${validHexId} location must redirect to /login, got ${resValidEventId.headers.location}`
    );
    assertCleanBody(resValidEventId.body, `/events/${validHexId}`);
    console.log(`   ✓ GET /events/${validHexId} without login redirected to /login (302, never 200).`);

    const resInvalidEventId = await makeRequest("/events/not-an-id");
    assert.strictEqual(
      resInvalidEventId.statusCode,
      302,
      `GET /events/not-an-id without login must redirect to /login (302), got ${resInvalidEventId.statusCode}`
    );
    assert.notStrictEqual(
      resInvalidEventId.statusCode,
      500,
      `GET /events/not-an-id without login must NEVER return 500`
    );
    assert.ok(
      resInvalidEventId.headers.location && resInvalidEventId.headers.location.includes("/login"),
      `GET /events/not-an-id location must redirect to /login, got ${resInvalidEventId.headers.location}`
    );
    assertCleanBody(resInvalidEventId.body, "/events/not-an-id");
    console.log(`   ✓ GET /events/not-an-id without login redirected to /login (302, never 500).`);

    // -------------------------------------------------------------
    // Step 6: GET /does-not-exist returns 404 page
    // -------------------------------------------------------------
    console.log("\n6. Testing 404 handling on GET /does-not-exist...");
    const res404 = await makeRequest("/does-not-exist");
    assert.strictEqual(res404.statusCode, 404, `GET /does-not-exist must return 404, got ${res404.statusCode}`);
    assertCleanBody(res404.body, "/does-not-exist");
    assert.ok(
      res404.body.includes("404") || res404.body.toLowerCase().includes("not found"),
      "Response must render 404 page"
    );
    console.log("   ✓ GET /does-not-exist returned friendly 404 page.");

    console.log("\n=================================================");
    console.log("ALL APP SMOKE TESTS PASSED (100%)");
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

runSmokeTests().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch((err) => {
  console.error("App smoke test failed:", err);
  process.exit(1);
});
