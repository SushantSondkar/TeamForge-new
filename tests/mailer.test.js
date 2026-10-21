const assert = require("assert");
const {
  sendMail,
  maskEmail,
  isSmtpConfigured,
  validateMailerConfig,
  setMockTransporter
} = require("../utils/mailer");
const {
  getBaseUrl,
  verifyEmail,
  resetPassword
} = require("../utils/emailTemplates");

console.log("=================================================");
console.log("RUNNING PHASE 9: TRANSACTIONAL MAILER & TEMPLATE TESTS");
console.log("=================================================\n");

async function runTests() {
  // Preserve initial environment state
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // Test 1: Email Masking Verification
    // -------------------------------------------------------------
    console.log("1. Testing Email Masking for Safe Logging...");
    assert.strictEqual(maskEmail("aaradhya.w@kkwagh.edu.in"), "a***@kkwagh.edu.in");
    assert.strictEqual(maskEmail("s@kkwagh.edu.in"), "s***@kkwagh.edu.in");
    assert.strictEqual(maskEmail("john.doe@gmail.com"), "j***@gmail.com");
    assert.strictEqual(maskEmail("invalid-email"), "i***");
    assert.strictEqual(maskEmail(""), "***");
    assert.strictEqual(maskEmail(null), "***");
    console.log("   ✓ Email masking formats verified.");

    // -------------------------------------------------------------
    // Test 2: Masked Logging with Real/Mock Transport (Privacy)
    // -------------------------------------------------------------
    console.log("2. Testing Masked Logging in Transport Mode (Zero Token/Body Leakage)...");
    let sentPayload = null;
    setMockTransporter({
      sendMail: async (mailOpts) => {
        sentPayload = mailOpts;
        return { messageId: "mock-msg-001" };
      }
    });

    const consoleLogs = [];
    const origLog = console.log;
    console.log = (...args) => consoleLogs.push(args.join(" "));

    try {
      const recipient = "aaradhya.w@kkwagh.edu.in";
      const secretToken = "super-secret-verification-token-999";
      const result = await sendMail({
        to: recipient,
        subject: "Verify Account",
        text: `Click here: http://localhost:8080/verify-email?token=${secretToken}`,
        html: `<a href="http://localhost:8080/verify-email?token=${secretToken}">Verify</a>`
      });

      assert.strictEqual(result.messageId, "mock-msg-001");
      assert.strictEqual(sentPayload.to, recipient);
      assert.ok(sentPayload.text.includes(secretToken));

      // Assert only "mail sent to <masked email>" is logged
      const loggedOutput = consoleLogs.join("\n");
      assert.ok(
        loggedOutput.includes("mail sent to a***@kkwagh.edu.in"),
        "Must log masked recipient: mail sent to a***@kkwagh.edu.in"
      );
      assert.strictEqual(
        loggedOutput.includes(secretToken),
        false,
        "CRITICAL: Secret token must NEVER be leaked in transport logs"
      );
      assert.strictEqual(
        loggedOutput.includes("Click here"),
        false,
        "Email text body must not be logged when sending via transport"
      );
    } finally {
      console.log = origLog;
      setMockTransporter(null);
    }
    console.log("   ✓ Masked logging verified and zero sensitive data leakage confirmed.");

    // -------------------------------------------------------------
    // Test 3: Dev-Mode Console Fallback
    // -------------------------------------------------------------
    console.log("3. Testing Dev-Mode Console Fallback (No SMTP Configured)...");
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.NODE_ENV = "development";
    setMockTransporter(null);

    const devLogs = [];
    console.log = (...args) => devLogs.push(args.join(" "));

    try {
      const devRecipient = "student.dev@kkwagh.edu.in";
      const devLink = "http://localhost:8080/verify-email?token=dev-click-me";
      const res = await sendMail({
        to: devRecipient,
        subject: "Activate Your TeamForge Account",
        text: `Link: ${devLink}`,
        html: `<p><a href="${devLink}">Link</a></p>`
      });

      assert.strictEqual(res.devMode, true);
      const devOutput = devLogs.join("\n");
      assert.ok(devOutput.includes("[DEV EMAIL FALLBACK]"), "Must indicate DEV EMAIL FALLBACK");
      assert.ok(devOutput.includes(devRecipient), "Must include recipient email in dev console");
      assert.ok(devOutput.includes(devLink), "Must include clickable link in dev console for developer");
    } finally {
      console.log = origLog;
    }
    console.log("   ✓ Dev-mode console fallback prints email body and link to server console.");

    // -------------------------------------------------------------
    // Test 4: Production Startup Failure when SMTP is Missing
    // -------------------------------------------------------------
    console.log("4. Testing Production Startup Failure on Missing SMTP Configuration...");
    process.env.NODE_ENV = "production";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    // A. Startup validation throws clear error in production
    assert.throws(
      () => {
        validateMailerConfig();
      },
      (err) => {
        return err instanceof Error && /SMTP configuration.*missing in production/i.test(err.message);
      },
      "validateMailerConfig must throw descriptive fatal error in production when SMTP_* missing"
    );

    // B. sendMail rejects in production when SMTP is missing
    await assert.rejects(
      async () => {
        await sendMail({
          to: "student@kkwagh.edu.in",
          subject: "Test",
          text: "Test body"
        });
      },
      /SMTP configuration is missing in production environment/i,
      "sendMail must reject when called in production without SMTP"
    );

    // C. When SMTP_* variables are set in production, startup validation passes
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "securepassword123";

    assert.strictEqual(isSmtpConfigured(), true);
    assert.doesNotThrow(() => {
      validateMailerConfig();
    }, "validateMailerConfig must succeed when SMTP variables are set in production");

    console.log("   ✓ Production startup failure and validation confirmed.");

    // -------------------------------------------------------------
    // Test 5: Email Templates (verifyEmail & resetPassword)
    // -------------------------------------------------------------
    console.log("5. Testing Reusable Email Templates & APP_BASE_URL Integration...");
    process.env.APP_BASE_URL = "http://localhost:8080";

    // 5A. verifyEmail template
    const verifyTmpl = verifyEmail({
      name: "Sushant Khairnar",
      token: "tok-verification-abc123xyz"
    });
    assert.strictEqual(verifyTmpl.subject, "Verify your TeamForge account");
    assert.ok(verifyTmpl.text.includes("TeamForge — KKWIEER Campus Hackathon Platform"));
    assert.ok(verifyTmpl.text.includes("Sushant Khairnar"));
    assert.ok(verifyTmpl.text.includes("http://localhost:8080/verify-email?token=tok-verification-abc123xyz"));
    assert.ok(verifyTmpl.html.includes("TeamForge"));
    assert.ok(verifyTmpl.html.includes("Verify Your Institutional Email"));
    assert.ok(verifyTmpl.html.includes("http://localhost:8080/verify-email?token=tok-verification-abc123xyz"));
    assert.ok(verifyTmpl.html.includes("Verify Email Address"));

    // 5B. resetPassword template
    const resetTmpl = resetPassword({
      name: "Aaradhya Wabale",
      token: "tok-reset-789"
    });
    assert.strictEqual(resetTmpl.subject, "Reset your TeamForge password");
    assert.ok(resetTmpl.text.includes("Aaradhya Wabale"));
    assert.ok(resetTmpl.text.includes("http://localhost:8080/reset-password?token=tok-reset-789"));
    assert.ok(resetTmpl.text.includes("1 hour"));
    assert.ok(resetTmpl.html.includes("Reset Your Password"));
    assert.ok(resetTmpl.html.includes("http://localhost:8080/reset-password?token=tok-reset-789"));
    assert.ok(resetTmpl.html.includes("Reset Password"));

    // 5C. Custom APP_BASE_URL handling
    process.env.APP_BASE_URL = "https://teamforge.kkwagh.edu.in/";
    const customTmpl = verifyEmail({
      name: "Student",
      token: "tok-custom"
    });
    assert.ok(
      customTmpl.text.includes("https://teamforge.kkwagh.edu.in/verify-email?token=tok-custom"),
      "Must correctly strip trailing slash from custom APP_BASE_URL"
    );

    console.log("   ✓ verifyEmail and resetPassword templates verified with correct branding and links.");

    console.log("\n=================================================");
    console.log("ALL PHASE 9 MAILER & TEMPLATE TESTS PASSED (100%)");
    console.log("=================================================\n");
  } finally {
    // Restore environment
    process.env = originalEnv;
  }
}

runTests().catch((err) => {
  console.error("Mailer test suite failed:", err);
  process.exit(1);
});
