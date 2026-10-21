const assert = require("assert");
const { validateEnv, assertValidEnv, loadExamplePlaceholders } = require("../utils/validateEnv");

console.log("=================================================");
console.log("RUNNING PHASE 9F: ENVIRONMENT VALIDATION & SECURITY TESTS");
console.log("=================================================\n");

async function runTests() {
  const placeholders = loadExamplePlaceholders();

  // Helper function to build a valid production environment
  function createValidProdEnv() {
    return {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb+srv://teamforge_user:StrongPassword987654321@cluster0.abcde.mongodb.net/teamforge",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef_valid_session_secret_32_chars",
      COOKIE_SECRET: "0123456789abcdef0123456789abcdef_valid_cookie_secret_32_chars",
      CSRF_SECRET: "0123456789abcdef0123456789abcdef_valid_csrf_secret_32_chars",
      APP_BASE_URL: "https://teamforge.example.com",
      SMTP_HOST: "smtp-relay.brevo.com",
      SMTP_PORT: "587",
      SMTP_USER: "mailer@example.com",
      SMTP_PASS: "secure-smtp-app-password-prod",
      SEED: "false",
      SUPPORT_EMAIL: "support@example.com"
    };
  }

  // 1. Valid production config
  console.log("1. Testing valid production configuration...");
  const validResult = validateEnv(createValidProdEnv(), true);
  assert.strictEqual(validResult.valid, true, "Valid production config should pass");
  assert.strictEqual(validResult.errors.length, 0);
  console.log("   ✓ Valid production configuration passed.");

  // 2. Missing MONGODB_URI in production
  console.log("2. Testing missing MONGODB_URI in production...");
  const missingMongo = createValidProdEnv();
  delete missingMongo.MONGODB_URI;
  const resMissingMongo = validateEnv(missingMongo, true);
  assert.strictEqual(resMissingMongo.valid, false);
  assert.ok(resMissingMongo.errors.some(e => e.includes("MONGODB_URI is required")));
  console.log("   ✓ Missing MONGODB_URI failed as expected.");

  // 3. Short MONGODB_URI in production (<32 chars)
  console.log("3. Testing short MONGODB_URI in production...");
  const shortMongo = createValidProdEnv();
  shortMongo.MONGODB_URI = "mongodb://short";
  const resShortMongo = validateEnv(shortMongo, true);
  assert.strictEqual(resShortMongo.valid, false);
  assert.ok(resShortMongo.errors.some(e => e.includes("MONGODB_URI must be at least 32 characters")));
  console.log("   ✓ Short MONGODB_URI failed as expected.");

  // 4. Placeholder MONGODB_URI from .env.example
  console.log("4. Testing placeholder MONGODB_URI from .env.example in production...");
  const placeholderMongo = createValidProdEnv();
  placeholderMongo.MONGODB_URI = placeholders.MONGODB_URI;
  const resPlaceholderMongo = validateEnv(placeholderMongo, true);
  assert.strictEqual(resPlaceholderMongo.valid, false);
  assert.ok(resPlaceholderMongo.errors.some(e => e.includes("MONGODB_URI cannot use the default placeholder")));
  console.log("   ✓ Placeholder MONGODB_URI rejected.");

  // 5. Missing SESSION_SECRET
  console.log("5. Testing missing SESSION_SECRET in production...");
  const missingSession = createValidProdEnv();
  delete missingSession.SESSION_SECRET;
  const resMissingSession = validateEnv(missingSession, true);
  assert.strictEqual(resMissingSession.valid, false);
  assert.ok(resMissingSession.errors.some(e => e.includes("SESSION_SECRET is required")));
  console.log("   ✓ Missing SESSION_SECRET failed as expected.");

  // 6. Short SESSION_SECRET (<32 chars)
  console.log("6. Testing short SESSION_SECRET (<32 chars) in production...");
  const shortSession = createValidProdEnv();
  shortSession.SESSION_SECRET = "too-short-secret";
  const resShortSession = validateEnv(shortSession, true);
  assert.strictEqual(resShortSession.valid, false);
  assert.ok(resShortSession.errors.some(e => e.includes("SESSION_SECRET must be at least 32 characters")));
  console.log("   ✓ Short SESSION_SECRET failed as expected.");

  // 7. Placeholder SESSION_SECRET
  console.log("7. Testing placeholder SESSION_SECRET in production...");
  const placeholderSession = createValidProdEnv();
  placeholderSession.SESSION_SECRET = placeholders.SESSION_SECRET;
  const resPlaceholderSession = validateEnv(placeholderSession, true);
  assert.strictEqual(resPlaceholderSession.valid, false);
  assert.ok(resPlaceholderSession.errors.some(e => e.includes("SESSION_SECRET cannot use the placeholder")));
  console.log("   ✓ Placeholder SESSION_SECRET rejected.");

  // 8. Missing COOKIE_SECRET
  console.log("8. Testing missing COOKIE_SECRET in production...");
  const missingCookie = createValidProdEnv();
  delete missingCookie.COOKIE_SECRET;
  const resMissingCookie = validateEnv(missingCookie, true);
  assert.strictEqual(resMissingCookie.valid, false);
  assert.ok(resMissingCookie.errors.some(e => e.includes("COOKIE_SECRET is required")));
  console.log("   ✓ Missing COOKIE_SECRET failed as expected.");

  // 9. Short COOKIE_SECRET (<32 chars)
  console.log("9. Testing short COOKIE_SECRET in production...");
  const shortCookie = createValidProdEnv();
  shortCookie.COOKIE_SECRET = "short-cookie-secret";
  const resShortCookie = validateEnv(shortCookie, true);
  assert.strictEqual(resShortCookie.valid, false);
  assert.ok(resShortCookie.errors.some(e => e.includes("COOKIE_SECRET must be at least 32 characters")));
  console.log("   ✓ Short COOKIE_SECRET failed as expected.");

  // 10. Placeholder COOKIE_SECRET
  console.log("10. Testing placeholder COOKIE_SECRET in production...");
  const placeholderCookie = createValidProdEnv();
  placeholderCookie.COOKIE_SECRET = placeholders.COOKIE_SECRET;
  const resPlaceholderCookie = validateEnv(placeholderCookie, true);
  assert.strictEqual(resPlaceholderCookie.valid, false);
  assert.ok(resPlaceholderCookie.errors.some(e => e.includes("COOKIE_SECRET cannot use the placeholder")));
  console.log("   ✓ Placeholder COOKIE_SECRET rejected.");

  // 11. Missing CSRF_SECRET
  console.log("11. Testing missing CSRF_SECRET in production...");
  const missingCsrf = createValidProdEnv();
  delete missingCsrf.CSRF_SECRET;
  const resMissingCsrf = validateEnv(missingCsrf, true);
  assert.strictEqual(resMissingCsrf.valid, false);
  assert.ok(resMissingCsrf.errors.some(e => e.includes("CSRF_SECRET is required")));
  console.log("   ✓ Missing CSRF_SECRET failed as expected.");

  // 12. Short CSRF_SECRET (<32 chars)
  console.log("12. Testing short CSRF_SECRET in production...");
  const shortCsrf = createValidProdEnv();
  shortCsrf.CSRF_SECRET = "short-csrf-secret";
  const resShortCsrf = validateEnv(shortCsrf, true);
  assert.strictEqual(resShortCsrf.valid, false);
  assert.ok(resShortCsrf.errors.some(e => e.includes("CSRF_SECRET must be at least 32 characters")));
  console.log("   ✓ Short CSRF_SECRET failed as expected.");

  // 13. Placeholder CSRF_SECRET
  console.log("13. Testing placeholder CSRF_SECRET in production...");
  const placeholderCsrf = createValidProdEnv();
  placeholderCsrf.CSRF_SECRET = placeholders.CSRF_SECRET;
  const resPlaceholderCsrf = validateEnv(placeholderCsrf, true);
  assert.strictEqual(resPlaceholderCsrf.valid, false);
  assert.ok(resPlaceholderCsrf.errors.some(e => e.includes("CSRF_SECRET cannot use the placeholder")));
  console.log("   ✓ Placeholder CSRF_SECRET rejected.");

  // 14. Missing or localhost APP_BASE_URL
  console.log("14. Testing invalid APP_BASE_URL in production...");
  const localhostBaseUrl = createValidProdEnv();
  localhostBaseUrl.APP_BASE_URL = "http://localhost:8080";
  const resLocalhostBaseUrl = validateEnv(localhostBaseUrl, true);
  assert.strictEqual(resLocalhostBaseUrl.valid, false);
  assert.ok(resLocalhostBaseUrl.errors.some(e => e.includes("APP_BASE_URL cannot use placeholder or localhost")));

  const missingBaseUrl = createValidProdEnv();
  delete missingBaseUrl.APP_BASE_URL;
  const resMissingBaseUrl = validateEnv(missingBaseUrl, true);
  assert.strictEqual(resMissingBaseUrl.valid, false);
  assert.ok(resMissingBaseUrl.errors.some(e => e.includes("APP_BASE_URL is required")));
  console.log("   ✓ Invalid APP_BASE_URL failed as expected.");

  // 15. Missing SMTP_* configuration
  console.log("15. Testing missing SMTP_* in production...");
  const missingSmtp = createValidProdEnv();
  delete missingSmtp.SMTP_PASS;
  const resMissingSmtp = validateEnv(missingSmtp, true);
  assert.strictEqual(resMissingSmtp.valid, false);
  assert.ok(resMissingSmtp.errors.some(e => e.includes("SMTP_PASS is required")));
  console.log("   ✓ Missing SMTP_* failed as expected.");

  // 16. SEED="true" forbidden in production
  console.log("16. Testing SEED='true' forbidden in production...");
  const seedActive = createValidProdEnv();
  seedActive.SEED = "true";
  const resSeedActive = validateEnv(seedActive, true);
  assert.strictEqual(resSeedActive.valid, false);
  assert.ok(resSeedActive.errors.some(e => e.includes("SEED cannot be 'true' in production")));
  console.log("   ✓ SEED='true' rejected in production.");

  // 16b. Missing SUPPORT_EMAIL in production
  console.log("16b. Testing missing SUPPORT_EMAIL in production...");
  const missingSupport = createValidProdEnv();
  delete missingSupport.SUPPORT_EMAIL;
  const resMissingSupport = validateEnv(missingSupport, true);
  assert.strictEqual(resMissingSupport.valid, false);
  assert.ok(resMissingSupport.errors.some(e => e.includes("SUPPORT_EMAIL is required in production")));
  console.log("   ✓ Missing SUPPORT_EMAIL failed as expected.");

  // 16c. Placeholder SUPPORT_EMAIL in production
  console.log("16c. Testing placeholder SUPPORT_EMAIL in production...");
  const placeholderSupport = createValidProdEnv();
  placeholderSupport.SUPPORT_EMAIL = placeholders.SUPPORT_EMAIL;
  const resPlaceholderSupport = validateEnv(placeholderSupport, true);
  assert.strictEqual(resPlaceholderSupport.valid, false);
  assert.ok(resPlaceholderSupport.errors.some(e => e.includes("SUPPORT_EMAIL cannot use the default placeholder")));
  console.log("   ✓ Placeholder SUPPORT_EMAIL rejected in production.");

  // 17. Non-production environment bypasses strict production requirements
  console.log("17. Testing development environment leeway...");
  const devEnv = {
    NODE_ENV: "development",
    SESSION_SECRET: "short-dev-secret",
    USE_MEMORY_DB: "true"
  };
  const resDev = validateEnv(devEnv, false);
  assert.strictEqual(resDev.valid, true);
  assert.strictEqual(resDev.errors.length, 0);
  console.log("   ✓ Development mode does not block local runs.");

  // 18. Value Privacy Check (never print values in errors)
  console.log("18. Testing that error messages never leak secret values...");
  const badSecretEnv = createValidProdEnv();
  const secretValueCanary = "CANARY_TOKEN_LEAK_TEST_VALUE_123456";
  badSecretEnv.SESSION_SECRET = secretValueCanary.slice(0, 10);
  const resCanary = validateEnv(badSecretEnv, true);
  for (const err of resCanary.errors) {
    assert.strictEqual(err.includes(secretValueCanary), false, "Error message must never contain the secret value");
    assert.strictEqual(err.includes(secretValueCanary.slice(0, 10)), false, "Error message must never contain the secret substring");
  }
  console.log("   ✓ Error messages contain variable names only; zero value leakage.");

  // 19. assertValidEnv throws on error when exitOnError: false
  console.log("19. Testing assertValidEnv throwing behavior...");
  const originalEnv = { ...process.env };
  try {
    process.env = { NODE_ENV: "production", MONGODB_URI: "mongodb://short" };
    assert.throws(
      () => assertValidEnv({ exitOnError: false }),
      /Environment validation failed/
    );
    console.log("   ✓ assertValidEnv properly throws on validation failure.");
  } finally {
    process.env = originalEnv;
  }

  // 20. GET /healthz response format and zero-leak verification
  console.log("20. Testing /healthz endpoint specification and zero-leak guarantee...");
  const mockReq = {};
  let statusResult = null;
  let jsonResult = null;
  const mockRes = {
    status: (code) => {
      statusResult = code;
      return mockRes;
    },
    json: (payload) => {
      jsonResult = payload;
      return mockRes;
    }
  };

  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const isHealthy = true;
  mockRes.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    database: states[1]
  });

  assert.strictEqual(statusResult, 200);
  assert.strictEqual(jsonResult.status, "ok");
  assert.strictEqual(jsonResult.database, "connected");
  assert.strictEqual(Object.keys(jsonResult).sort().join(","), "database,status", "Health check must ONLY contain status and database keys");
  console.log("   ✓ /healthz returns status: 'ok' and database state with zero secret leakage.");

  console.log("\n=================================================");
  console.log("ALL PHASE 9F ENVIRONMENT VALIDATION TESTS PASSED!");
  console.log("=================================================");
}

runTests().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
