/**
 * utils/mailer.js
 * 
 * Transactional email service for TeamForge.
 * Supports SMTP via nodemailer with environment-based fallback:
 * - Production: Strictly requires SMTP_* variables; fails startup if missing.
 * - Development/Test: If SMTP_* is missing, prints email body to server console for local testing.
 * - Privacy: In real SMTP mode, logs ONLY "mail sent to <masked email>". Never logs tokens/links/passwords.
 */

const nodemailer = require("nodemailer");

let mockTransporter = null;

/**
 * Mask an email address for privacy-safe logging.
 * e.g., 'aaradhya.w@kkwagh.edu.in' -> 'a***@kkwagh.edu.in'
 *       's@kkwagh.edu.in' -> 's***@kkwagh.edu.in'
 * 
 * @param {string} email
 * @returns {string} Masked email string
 */
function maskEmail(email) {
  if (!email || typeof email !== "string") return "***";
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) {
    return trimmed.length > 0 ? `${trimmed[0]}***` : "***";
  }
  const user = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const initial = user[0] || "";
  return `${initial}***@${domain}`;
}

/**
 * Check whether SMTP configuration is set in environment.
 * Requires SMTP_HOST, SMTP_USER, and SMTP_PASS.
 * 
 * @returns {boolean}
 */
function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

/**
 * Validate mailer configuration at startup.
 * Throws an Error if NODE_ENV is 'production' and SMTP configuration is missing.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.exitOnFail=false] - Whether to call process.exit(1) on failure
 * @returns {boolean}
 */
function validateMailerConfig({ exitOnFail = false } = {}) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !isSmtpConfigured()) {
    const errorMsg = "SMTP configuration (SMTP_HOST, SMTP_USER, SMTP_PASS) is missing in production environment. Transactional emails cannot be sent.";
    if (exitOnFail) {
      console.error(`FATAL ERROR: ${errorMsg}`);
      process.exit(1);
    }
    throw new Error(errorMsg);
  }
  return true;
}

/**
 * Create a real nodemailer transport using SMTP settings from env.
 * 
 * @returns {Object} nodemailer transporter
 */
function createTransportFromEnv() {
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE !== "false" && port === 465);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Set a mock transporter for testing (avoids sending real emails in test runs).
 * 
 * @param {Object|null} transporter
 */
function setMockTransporter(transporter) {
  mockTransporter = transporter;
}

/**
 * Retrieve the active transporter (mock if set, otherwise created from env).
 * 
 * @returns {Object}
 */
function getTransporter() {
  if (mockTransporter) {
    return mockTransporter;
  }
  return createTransportFromEnv();
}

/**
 * Send a transactional email.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.text - Plain text fallback body
 * @param {string} [options.html] - HTML formatted email body
 * @returns {Promise<Object>} Delivery info or dev fallback result
 */
async function sendMail({ to, subject, text, html }) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email ('to') is required for sendMail.");
  }

  // 1. Production check: If SMTP is missing in production, fail explicitly
  if (process.env.NODE_ENV === "production" && !isSmtpConfigured() && !mockTransporter) {
    throw new Error("SMTP configuration is missing in production environment. Transactional emails cannot be sent.");
  }

  // 2. Real SMTP sending (or mock transporter in test mode)
  if (isSmtpConfigured() || mockTransporter) {
    const transporter = getTransporter();
    const mailOptions = {
      from: process.env.MAIL_FROM || '"TeamForge" <noreply@teamforge.kkwagh.edu.in>',
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);

    // Rule: Log ONLY "mail sent to <masked email>", never the body or any token/link
    console.log(`mail sent to ${maskEmail(to)}`);

    return info;
  }

  // 3. Development / Test fallback: Print email body to server console ONLY (never in browser)
  console.log("\n==================== [DEV EMAIL FALLBACK] ====================");
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body (Plain Text):\n${text}`);
  if (html) {
    console.log(`Body (HTML):\n${html}`);
  }
  console.log("==============================================================\n");

  return {
    accepted: [to],
    devMode: true,
    messageId: `dev-fallback-${Date.now()}`
  };
}

module.exports = {
  sendMail,
  maskEmail,
  isSmtpConfigured,
  validateMailerConfig,
  setMockTransporter,
  getTransporter
};
