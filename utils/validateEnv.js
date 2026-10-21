/**
 * Environment Configuration Validation Module
 * 
 * Enforces production readiness and secret integrity:
 * - Requires MONGODB_URI, SESSION_SECRET, COOKIE_SECRET, CSRF_SECRET
 * - Ensures secrets are at least 32 characters and not equal to .env.example placeholders
 * - Requires APP_BASE_URL and SMTP_* settings in production
 * - Prohibits SEED=true in production
 * - Prints which variable failed validation, NEVER printing sensitive values
 */

const fs = require("fs");
const path = require("path");

/**
 * Dynamically extract placeholders from .env.example
 */
function loadExamplePlaceholders() {
  const examplePath = path.resolve(__dirname, "..", ".env.example");
  const placeholders = {};
  try {
    if (fs.existsSync(examplePath)) {
      const content = fs.readFileSync(examplePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (val) placeholders[key] = val;
        }
      }
    }
  } catch (e) {
    // Fallback if example cannot be read
  }
  return placeholders;
}

const EXAMPLE_PLACEHOLDERS = loadExamplePlaceholders();

function validateEnv(env = process.env, isProduction = (env.NODE_ENV === "production")) {
  const errors = [];
  const placeholders = Object.keys(EXAMPLE_PLACEHOLDERS).length > 0 ? EXAMPLE_PLACEHOLDERS : loadExamplePlaceholders();

  if (isProduction) {
    // 1. MONGODB_URI
    if (!env.MONGODB_URI || !env.MONGODB_URI.trim()) {
      errors.push("MONGODB_URI is required in production");
    } else if (env.MONGODB_URI.trim().length < 32) {
      errors.push("MONGODB_URI must be at least 32 characters in production");
    } else if (placeholders.MONGODB_URI && env.MONGODB_URI.trim() === placeholders.MONGODB_URI) {
      errors.push("MONGODB_URI cannot use the default placeholder from .env.example in production");
    }

    // 2. SESSION_SECRET
    if (!env.SESSION_SECRET || typeof env.SESSION_SECRET !== "string") {
      errors.push("SESSION_SECRET is required in production");
    } else if (env.SESSION_SECRET.length < 32) {
      errors.push("SESSION_SECRET must be at least 32 characters in production");
    } else if (placeholders.SESSION_SECRET && env.SESSION_SECRET === placeholders.SESSION_SECRET) {
      errors.push("SESSION_SECRET cannot use the placeholder from .env.example in production");
    }

    // 3. COOKIE_SECRET
    if (!env.COOKIE_SECRET || typeof env.COOKIE_SECRET !== "string") {
      errors.push("COOKIE_SECRET is required in production");
    } else if (env.COOKIE_SECRET.length < 32) {
      errors.push("COOKIE_SECRET must be at least 32 characters in production");
    } else if (placeholders.COOKIE_SECRET && env.COOKIE_SECRET === placeholders.COOKIE_SECRET) {
      errors.push("COOKIE_SECRET cannot use the placeholder from .env.example in production");
    }

    // 4. CSRF_SECRET
    if (!env.CSRF_SECRET || typeof env.CSRF_SECRET !== "string") {
      errors.push("CSRF_SECRET is required in production");
    } else if (env.CSRF_SECRET.length < 32) {
      errors.push("CSRF_SECRET must be at least 32 characters in production");
    } else if (placeholders.CSRF_SECRET && env.CSRF_SECRET === placeholders.CSRF_SECRET) {
      errors.push("CSRF_SECRET cannot use the placeholder from .env.example in production");
    }

    // 5. APP_BASE_URL
    if (!env.APP_BASE_URL || !env.APP_BASE_URL.trim()) {
      errors.push("APP_BASE_URL is required in production");
    } else if (placeholders.APP_BASE_URL && (env.APP_BASE_URL.trim() === placeholders.APP_BASE_URL || env.APP_BASE_URL.includes("localhost"))) {
      errors.push("APP_BASE_URL cannot use placeholder or localhost in production");
    }

    // 6. SMTP_* (Transactional Mailer)
    const requiredSmtp = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
    for (const key of requiredSmtp) {
      if (!env[key] || !String(env[key]).trim()) {
        errors.push(`${key} is required for transactional emails in production`);
      }
    }

    // 7. SEED must not be true
    if (env.SEED === "true") {
      errors.push("SEED cannot be 'true' in production (demo seeding is forbidden)");
    }
  }

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    errors
  };
}

/**
 * Startup hook executed when booting app.js
 */
function assertValidEnv(options = {}) {
  const { exitOnError = (process.env.NODE_ENV !== "test") } = options;
  const isProduction = process.env.NODE_ENV === "production";
  const result = validateEnv(process.env, isProduction);
  if (!result.valid) {
    console.error("\n❌ ========================================================");
    console.error("❌ FATAL: Environment configuration validation failed:");
    result.errors.forEach(err => {
      console.error(`❌   - ${err}`);
    });
    console.error("❌ ========================================================\n");
    if (exitOnError) {
      process.exit(1);
    } else {
      throw new Error(`Environment validation failed: ${result.errors.join("; ")}`);
    }
  }
}

module.exports = {
  validateEnv,
  assertValidEnv,
  loadExamplePlaceholders
};
