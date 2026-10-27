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
let cachedTransporter = null;

/**
 * Extract recipient domain for privacy-safe logging.
 * e.g., 'aaradhya.w@kkwagh.edu.in' -> 'kkwagh.edu.in'
 * 
 * @param {string} email
 * @returns {string} Recipient domain or 'unknown'
 */
function getRecipientDomain(email) {
  if (!email || typeof email !== "string") return "unknown";
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1 || atIndex === email.length - 1) return "unknown";
  return email.slice(atIndex + 1).toLowerCase().trim();
}

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
 * Determine a valid sender 'from' header.
 * Falls back to SMTP_USER if MAIL_FROM and SUPPORT_EMAIL are not set,
 * preventing Brevo rejection of invalid default sender domains.
 * 
 * @returns {string}
 */
function getFromAddress() {
  if (process.env.MAIL_FROM && process.env.MAIL_FROM.trim()) {
    return process.env.MAIL_FROM.trim();
  }
  if (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim()) {
    return `"TeamForge" <${process.env.SUPPORT_EMAIL.trim()}>`;
  }
  if (process.env.SMTP_USER && process.env.SMTP_USER.trim() && process.env.SMTP_USER.includes("@")) {
    return `"TeamForge" <${process.env.SMTP_USER.trim()}>`;
  }
  return '"TeamForge" <noreply@example.com>';
}

/**
 * Create a real nodemailer transport using SMTP settings from env.
 * Configures connection, greeting, and socket timeouts for resilient cloud delivery.
 * 
 * @returns {Object} nodemailer transporter
 */
function createTransportFromEnv() {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = parseInt((process.env.SMTP_PORT || "587").toString().trim(), 10);
  const secure = process.env.SMTP_SECURE === "true" || (process.env.SMTP_SECURE !== "false" && port === 465);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

/**
 * Set a mock transporter for testing (avoids sending real emails in test runs).
 * 
 * @param {Object|null} transporter
 */
function setMockTransporter(transporter) {
  mockTransporter = transporter;
  cachedTransporter = null;
}

/**
 * Clear cached transporter instance.
 */
function clearCachedTransporter() {
  cachedTransporter = null;
}

/**
 * Retrieve the active transporter (mock if set, otherwise cached singleton created from env).
 * 
 * @returns {Object}
 */
function getTransporter() {
  if (mockTransporter) {
    return mockTransporter;
  }
  if (!cachedTransporter) {
    cachedTransporter = createTransportFromEnv();
  }
  return cachedTransporter;
}

/**
 * Send a transactional email.
 * Includes automatic 1-retry for transient network drops and privacy-safe logging.
 * Logs recipient domain only, message ID, and success or failure status.
 * Never logs tokens, passwords, or SMTP keys.
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

  const domain = getRecipientDomain(to);

  // 1. Production check: If SMTP is missing in production, fail explicitly
  if (process.env.NODE_ENV === "production" && !isSmtpConfigured() && !mockTransporter) {
    const errorMsg = "SMTP configuration is missing in production environment. Transactional emails cannot be sent.";
    console.error(`[Email] result=failure domain=@${domain} error=${errorMsg}`);
    throw new Error(errorMsg);
  }

  // 2. Real SMTP sending (or mock transporter in test mode)
  if (isSmtpConfigured() || mockTransporter) {
    const mailOptions = {
      from: getFromAddress(),
      to,
      subject,
      text,
      html
    };

    let lastError = null;
    let info = null;

    // Attempt delivery with 1 retry for transient network/connection drops
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const transporter = getTransporter();
        info = await transporter.sendMail(mailOptions);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (mockTransporter || attempt === 2) break;
        clearCachedTransporter();
        await new Promise(r => setTimeout(r, 600));
      }
    }

    if (lastError) {
      console.error(`[Email] result=failure domain=@${domain} error=${lastError.message}`);
      throw lastError;
    }

    const messageId = (info && info.messageId) ? info.messageId : "unknown";
    console.log(`[Email] result=success domain=@${domain} messageId=${messageId}`);
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

  const fallbackId = `dev-fallback-${Date.now()}`;
  console.log(`[Email] result=success domain=@${domain} messageId=${fallbackId}`);
  console.log(`mail sent to ${maskEmail(to)}`);

  return {
    accepted: [to],
    devMode: true,
    messageId: fallbackId
  };
}

module.exports = {
  sendMail,
  maskEmail,
  getRecipientDomain,
  getFromAddress,
  isSmtpConfigured,
  validateMailerConfig,
  setMockTransporter,
  getTransporter,
  clearCachedTransporter
};
