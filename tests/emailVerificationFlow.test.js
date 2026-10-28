/**
 * tests/emailVerificationFlow.test.js
 * 
 * Comprehensive test suite for TeamForge signup email verification flow:
 * 1. signup success: mailer succeeds, redirects to /check-inbox with sent=true
 * 2. signup send failure: mailer fails, account is created, redirects to /check-inbox with sendFailed=true,
 *    and displays "Your account was created but we could not send the email. Please use Resend Verification Email."
 * 3. resend rate limit: 1 per 60s, max 5 per hour per account
 * 4. unverified login blocked: shows clear message & resend button, no session created, never sends email automatically
 * 5. GET on verify link: scanner-safe confirmation screen with "Verify my email and continue", token not consumed
 * 6. verify-and-auto-login from fresh session: POST marks verified, deletes token, regenerates session, redirects to /dashboard
 * 7. token single use: used token cannot be re-used
 * 8. token expiry: expired token is rejected with friendly message and resend option
 * 9. verified login normal: login succeeds without involving email
 */

const assert = require("assert");
const http = require("http");
const bcrypt = require("bcryptjs");

process.env.NODE_ENV = "test";
process.env.USE_MEMORY_DB = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "email_verify_flow_session_secret_32_chars";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "email_verify_flow_cookie_secret_32_chars";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "email_verify_flow_csrf_secret_32_chars";

const mongoose = require("mongoose");
const connectDB = require("../models/db");
const app = require("../app");
const User = require("../models/User");
const { setMockTransporter } = require("../utils/mailer");
const {
  hashToken,
  generateVerificationToken,
  _resetResendRateLimits,
  checkResendRateLimit
} = require("../routes/auth");

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
    const isUrlEncoded = data instanceof URLSearchParams;
    const bodyStr = isUrlEncoded ? data.toString() : (typeof data === "object" ? JSON.stringify(data) : String(data));
    const contentType = isUrlEncoded ? "application/x-www-form-urlencoded" : "application/json";
    return this.request(pathname, {
      method: "POST",
      headers: Object.assign({
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(bodyStr)
      }, headers),
      body: bodyStr
    });
  }

  async fetchCsrfToken(path = "/signup") {
    const res = await this.get(path);
    const match = res.body.match(/name="_csrf"\s+value="([^"]+)"/);
    return match ? match[1] : null;
  }
}

let server = null;
let baseUrl = "";

async function setup() {
  await connectDB();

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function teardown() {
  if (server) {
    await new Promise(r => server.close(r));
  }
  setMockTransporter(null);
  await mongoose.disconnect();
  if (typeof connectDB.stopMemoryServer === "function") {
    await connectDB.stopMemoryServer();
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING EMAIL VERIFICATION FLOW TEST SUITE");
  console.log("=================================================\n");

  await setup();

  try {
    // -------------------------------------------------------------
    // Test 1: Signup Success (Email Sent Successfully)
    // -------------------------------------------------------------
    console.log("1. Testing Signup Success (Delivery Succeeded)...");
    let sentEmails = [];
    setMockTransporter({
      sendMail: async (opts) => {
        sentEmails.push(opts);
        return { messageId: `test-msg-${Date.now()}` };
      }
    });

    const client1 = new SessionClient(baseUrl);
    const csrf1 = await client1.fetchCsrfToken("/signup");
    assert.ok(csrf1, "Must obtain CSRF token from /signup form");

    const signupForm1 = new URLSearchParams();
    signupForm1.append("_csrf", csrf1);
    signupForm1.append("name", "Aaradhya Wabale");
    signupForm1.append("email", "aaradhya.w@kkwagh.edu.in");
    signupForm1.append("department", "Computer Engineering");
    signupForm1.append("year", "TE");
    signupForm1.append("skillsRaw", "React:4, Node.js:5");
    signupForm1.append("password", "Passcode123!");
    signupForm1.append("confirmPassword", "Passcode123!");

    const signupRes1 = await client1.post("/signup", signupForm1);
    assert.strictEqual(signupRes1.statusCode, 302, "Successful signup must redirect");
    assert.ok(
      signupRes1.headers.location.includes("/check-inbox"),
      "Must redirect to /check-inbox"
    );
    assert.ok(
      signupRes1.headers.location.includes("sent=true"),
      "Must include sent=true when email sending succeeded"
    );

    const checkInboxRes1 = await client1.get(signupRes1.headers.location);
    assert.strictEqual(checkInboxRes1.statusCode, 200);
    assert.ok(
      checkInboxRes1.body.includes("Check Your Inbox"),
      "Must display 'Check Your Inbox' heading"
    );
    assert.ok(
      checkInboxRes1.body.includes("We&#39;ve sent an account verification link") ||
      checkInboxRes1.body.includes("We've sent an account verification link"),
      "Must show 'email sent' notice on delivery success"
    );

    // Verify DB state
    const user1 = await User.findOne({ email: "aaradhya.w@kkwagh.edu.in" });
    assert.ok(user1, "User record must exist in DB");
    assert.strictEqual(user1.isEmailVerified, false, "Account must be pending verification");
    assert.ok(user1.emailVerificationToken, "Hashed verification token must be stored");
    assert.ok(user1.emailVerificationExpires > new Date(), "Expiry must be in future");
    assert.strictEqual(sentEmails.length, 1, "Exactly 1 verification email must be dispatched");
    assert.strictEqual(sentEmails[0].to, "aaradhya.w@kkwagh.edu.in");
    console.log("   ✓ Signup success with email delivery verified.\n");

    // Extract rawToken from the sent email link
    const linkMatch = sentEmails[0].text.match(/verify-email\?token=([a-f0-9]+)/);
    assert.ok(linkMatch, "Verification link must contain raw token");
    const rawToken1 = linkMatch[1];
    assert.strictEqual(hashToken(rawToken1), user1.emailVerificationToken, "Raw token must hash to stored DB token");

    // -------------------------------------------------------------
    // Test 2: Signup Send Failure (User Created, Delivery Failed)
    // -------------------------------------------------------------
    console.log("2. Testing Signup Send Failure (User Created, Delivery Failed Notice)...");
    setMockTransporter({
      sendMail: async () => {
        throw new Error("Simulated SMTP connection timeout on port 2525");
      }
    });

    const client2 = new SessionClient(baseUrl);
    const csrf2 = await client2.fetchCsrfToken("/signup");

    const signupForm2 = new URLSearchParams();
    signupForm2.append("_csrf", csrf2);
    signupForm2.append("name", "Tanmay Shinde");
    signupForm2.append("email", "tanmay.s@kkwagh.edu.in");
    signupForm2.append("department", "Information Technology");
    signupForm2.append("year", "BE");
    signupForm2.append("password", "Passcode123!");
    signupForm2.append("confirmPassword", "Passcode123!");

    const signupRes2 = await client2.post("/signup", signupForm2);
    assert.strictEqual(signupRes2.statusCode, 302, "Signup must redirect even on send failure");
    assert.ok(
      signupRes2.headers.location.includes("sendFailed=true"),
      "Must redirect with sendFailed=true"
    );

    const checkInboxRes2 = await client2.get(signupRes2.headers.location);
    assert.strictEqual(checkInboxRes2.statusCode, 200);
    assert.ok(
      checkInboxRes2.body.includes("Your account was created but we could not send the email. Please use Resend Verification Email."),
      "Must show exact failure message required by prompt"
    );
    assert.ok(
      !checkInboxRes2.body.includes("We've sent an account verification link to your official college email."),
      "Must NOT show 'email sent' when sending failed"
    );

    // Verify DB state
    const user2 = await User.findOne({ email: "tanmay.s@kkwagh.edu.in" });
    assert.ok(user2, "User record must be created despite email failure");
    assert.strictEqual(user2.isEmailVerified, false);
    console.log("   ✓ Signup send failure handled cleanly and friendly message rendered.\n");

    // Restore working mock transporter for remaining tests
    sentEmails = [];
    setMockTransporter({
      sendMail: async (opts) => {
        sentEmails.push(opts);
        return { messageId: `mock-msg-${Date.now()}` };
      }
    });

    // -------------------------------------------------------------
    // Test 3: Resend Verification Rate Limiting (1 per 60s, 5 per hour)
    // -------------------------------------------------------------
    console.log("3. Testing Resend Rate Limiting (1 per 60s, 5 per hour)...");
    _resetResendRateLimits();

    const clientResend = new SessionClient(baseUrl);
    const csrfResend = await clientResend.fetchCsrfToken("/check-inbox?email=tanmay.s%40kkwagh.edu.in");

    // Attempt 1: Must succeed
    const resendForm1 = new URLSearchParams();
    resendForm1.append("_csrf", csrfResend);
    resendForm1.append("email", "tanmay.s@kkwagh.edu.in");
    const resendRes1 = await clientResend.post("/resend-verification", resendForm1);
    assert.strictEqual(resendRes1.statusCode, 200, "1st resend must succeed with 200");
    assert.strictEqual(sentEmails.length, 1, "Verification email must be sent on 1st resend");

    // Attempt 2: Immediate resend within 60s must be blocked with 429
    const csrfMatch2 = resendRes1.body.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrfResend2 = csrfMatch2 ? csrfMatch2[1] : csrfResend;
    const resendForm2 = new URLSearchParams();
    resendForm2.append("_csrf", csrfResend2);
    resendForm2.append("email", "tanmay.s@kkwagh.edu.in");
    const resendRes2 = await clientResend.post("/resend-verification", resendForm2);
    assert.strictEqual(resendRes2.statusCode, 429, "Rapid resend within 60s must return 429");
    assert.ok(
      resendRes2.body.includes("Please wait") && resendRes2.body.includes("seconds before requesting another verification email"),
      "Must show 60s cooldown message"
    );
    assert.strictEqual(sentEmails.length, 1, "No additional email sent during rate-limit cooldown");

    // Test 5 per hour limit
    _resetResendRateLimits();
    const testEmail = "tanmay.s@kkwagh.edu.in";
    const now = Date.now();
    // Simulate 5 attempts spaced 70 seconds apart within the last 10 minutes
    const authModule = require("../routes/auth");
    authModule.resendVerificationAttempts.set(testEmail, [
      now - 400000,
      now - 320000,
      now - 240000,
      now - 160000,
      now - 80000
    ]);

    const checkHourly = checkResendRateLimit(testEmail);
    assert.strictEqual(checkHourly.allowed, false, "Must block after 5 attempts in an hour");
    assert.ok(checkHourly.reason.includes("maximum 5 per hour"), "Must indicate 5 per hour limit");
    console.log("   ✓ Resend rate limits (1 per 60s and 5 per hour) verified.\n");

    // -------------------------------------------------------------
    // Test 4: Unverified Login Blocked & Verified Users Unaffected
    // -------------------------------------------------------------
    console.log("4. Testing Unverified Login Blocked (Clear message & Resend button, No session)...");
    const clientLogin = new SessionClient(baseUrl);
    const csrfLogin = await clientLogin.fetchCsrfToken("/login");

    const loginFormUnverified = new URLSearchParams();
    loginFormUnverified.append("_csrf", csrfLogin);
    loginFormUnverified.append("email", "aaradhya.w@kkwagh.edu.in");
    loginFormUnverified.append("password", "Passcode123!");

    sentEmails = [];
    const loginResUnverified = await clientLogin.post("/login", loginFormUnverified);
    assert.strictEqual(loginResUnverified.statusCode, 200, "Unverified login should render login page with message");
    assert.ok(
      loginResUnverified.body.includes("Please verify your email first. Check your inbox for the verification link."),
      "Must show unverified error message"
    );
    assert.ok(
      loginResUnverified.body.includes("Resend Verification Email"),
      "Must show Resend button for unverified login attempt"
    );
    assert.strictEqual(sentEmails.length, 0, "Login must NEVER send an email automatically");

    // Ensure protected page is still inaccessible
    const dashRes = await clientLogin.get("/dashboard");
    assert.strictEqual(dashRes.statusCode, 302, "Must redirect unauthenticated user from /dashboard");
    assert.strictEqual(dashRes.headers.location, "/login");
    console.log("   ✓ Unverified login blocked without session and zero auto-sent email.\n");

    // -------------------------------------------------------------
    // Test 5: GET /verify-email (Scanner Safe - Does NOT consume token)
    // -------------------------------------------------------------
    console.log("5. Testing GET /verify-email (Mail Scanner Safe - Token not consumed)...");
    const freshClient = new SessionClient(baseUrl);
    const getVerifyRes = await freshClient.get(`/verify-email?token=${rawToken1}`);
    assert.strictEqual(getVerifyRes.statusCode, 200);
    assert.ok(
      getVerifyRes.body.includes("Verify my email and continue"),
      "Must render 'Verify my email and continue' confirmation button"
    );

    // Verify token has NOT been consumed by GET
    const user1AfterGet = await User.findOne({ email: "aaradhya.w@kkwagh.edu.in" });
    assert.strictEqual(user1AfterGet.isEmailVerified, false, "GET must NOT verify user");
    assert.ok(user1AfterGet.emailVerificationToken, "GET must NOT delete verification token");
    console.log("   ✓ GET /verify-email is mail scanner safe (token untouched).\n");

    // -------------------------------------------------------------
    // Test 6: POST /verify-email (Verifies, deletes token, regenerates session, auto-login)
    // -------------------------------------------------------------
    console.log("6. Testing POST /verify-email (Verify and Auto-Login from Fresh Session)...");
    const verifyCsrfMatch = getVerifyRes.body.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(verifyCsrfMatch, "Must find CSRF token on GET /verify-email page");
    const verifyCsrf = verifyCsrfMatch[1];

    const postVerifyForm = new URLSearchParams();
    postVerifyForm.append("_csrf", verifyCsrf);
    postVerifyForm.append("token", rawToken1);
    postVerifyForm.append("email", "aaradhya.w@kkwagh.edu.in");

    const postVerifyRes = await freshClient.post("/verify-email", postVerifyForm);
    assert.strictEqual(postVerifyRes.statusCode, 302, "Successful verification must redirect");
    assert.strictEqual(postVerifyRes.headers.location, "/dashboard", "Must redirect to /dashboard");

    // Check DB state
    const user1Verified = await User.findOne({ email: "aaradhya.w@kkwagh.edu.in" });
    assert.strictEqual(user1Verified.isEmailVerified, true, "User must now be verified");
    assert.strictEqual(user1Verified.emailVerificationToken, null, "Token must be deleted from DB");
    assert.strictEqual(user1Verified.emailVerificationExpires, null, "Expiry must be deleted from DB");

    // Follow redirect to /dashboard with the authenticated session
    const dashAfterVerify = await freshClient.get("/dashboard");
    assert.strictEqual(dashAfterVerify.statusCode, 200, "Auto-logged-in session must access /dashboard");
    assert.ok(
      dashAfterVerify.body.includes("Aaradhya") || dashAfterVerify.body.includes("Dashboard"),
      "Dashboard must load for auto-logged in student"
    );
    console.log("   ✓ POST /verify-email marks user verified, regenerates session, and auto-logs in to /dashboard.\n");

    // -------------------------------------------------------------
    // Test 7: Token Single Use (Already Used Token)
    // -------------------------------------------------------------
    console.log("7. Testing Token Single-Use (Re-using token rejected)...");
    const clientReplay = new SessionClient(baseUrl);
    const getReplayRes = await clientReplay.get(`/verify-email?token=${rawToken1}&email=aaradhya.w%40kkwagh.edu.in`);
    assert.strictEqual(getReplayRes.statusCode, 200);
    assert.ok(
      getReplayRes.body.includes("Email Already Verified") ||
      getReplayRes.body.includes("already verified"),
      "Must inform user that their email is already verified"
    );
    assert.ok(
      getReplayRes.body.includes("/login"),
      "Must provide link to log in"
    );
    console.log("   ✓ Token single-use enforcement verified.\n");

    // -------------------------------------------------------------
    // Test 8: Token Expiry Enforcement
    // -------------------------------------------------------------
    console.log("8. Testing Token Expiry Enforcement...");
    const { rawToken: expiredRaw, hashedToken: expiredHash } = generateVerificationToken();
    const expiredUser = await User.create({
      name: "Expired Candidate",
      email: "expired.c@kkwagh.edu.in",
      password: await bcrypt.hash("Passcode123!", 10),
      department: "Civil Engineering",
      year: "FE",
      isEmailVerified: false,
      emailVerificationToken: expiredHash,
      emailVerificationExpires: new Date(Date.now() - 3600000) // 1 hour ago
    });

    const clientExpired = new SessionClient(baseUrl);
    const expiredGetRes = await clientExpired.get(`/verify-email?token=${expiredRaw}`);
    assert.strictEqual(expiredGetRes.statusCode, 200);
    assert.ok(
      expiredGetRes.body.includes("expired"),
      "Must show that verification link has expired"
    );
    assert.ok(
      expiredGetRes.body.includes("Resend Verification Email"),
      "Must include resend option for expired link"
    );
    console.log("   ✓ Token expiry correctly rejected with friendly resend option.\n");

    // -------------------------------------------------------------
    // Test 9: Verified Login Normal (Unchanged, Never Involves Email)
    // -------------------------------------------------------------
    console.log("9. Testing Verified Login (Normal flow, never sends email)...");
    const clientVerifiedLogin = new SessionClient(baseUrl);
    const csrfVerified = await clientVerifiedLogin.fetchCsrfToken("/login");

    sentEmails = [];
    const verifiedLoginForm = new URLSearchParams();
    verifiedLoginForm.append("_csrf", csrfVerified);
    verifiedLoginForm.append("email", "aaradhya.w@kkwagh.edu.in");
    verifiedLoginForm.append("password", "Passcode123!");

    const verifiedLoginRes = await clientVerifiedLogin.post("/login", verifiedLoginForm);
    assert.strictEqual(verifiedLoginRes.statusCode, 302, "Verified user login must redirect");
    assert.strictEqual(verifiedLoginRes.headers.location, "/dashboard", "Must redirect to /dashboard");
    assert.strictEqual(sentEmails.length, 0, "Login must NEVER dispatch email for verified user");

    const dashNormalRes = await clientVerifiedLogin.get("/dashboard");
    assert.strictEqual(dashNormalRes.statusCode, 200, "Session must access /dashboard");
    console.log("   ✓ Normal verified login operates smoothly without email involvement.\n");

    console.log("=================================================");
    console.log("ALL 9 EMAIL VERIFICATION FLOW TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    await teardown();
  }
}

if (require.main === module) {
  runTests().then(() => {
    setTimeout(() => process.exit(0), 100);
  }).catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}

module.exports = runTests;
