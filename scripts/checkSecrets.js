/**
 * Secrets Audit & Hygiene Verification Script
 * 
 * Verifies that:
 * 1. .env is NOT tracked by Git and is covered by .gitignore.
 * 2. No file in the repository (including .env if present) contains the placeholder
 *    secret values defined in .env.example.
 * 
 * Usage: npm run check-secrets
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

const TARGET_SECRET_KEYS = new Set(["SESSION_SECRET", "COOKIE_SECRET", "CSRF_SECRET"]);

// Extract secret placeholder strings from .env.example that must never appear in live code
function getForbiddenPlaceholders() {
  const examplePath = path.join(ROOT_DIR, ".env.example");
  if (!fs.existsSync(examplePath)) return [];
  const content = fs.readFileSync(examplePath, "utf8");
  const placeholders = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (TARGET_SECRET_KEYS.has(key) && val.length > 0) {
        placeholders.push(val);
      }
    }
  }
  return placeholders;
}

// Files and directories excluded from content scanning
const EXCLUDED_PATHS = new Set([
  path.join(ROOT_DIR, ".env.example"),
  path.join(ROOT_DIR, "scripts", "checkSecrets.js"),
  path.join(ROOT_DIR, "tests", "validateEnv.test.js")
]);

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".gemini",
  "coverage"
]);

function checkGitTrackedEnv() {
  try {
    const tracked = execSync("git ls-files .env", { cwd: ROOT_DIR, encoding: "utf8" }).trim();
    if (tracked.length > 0) {
      console.error("❌ SECURITY FAILURE: .env is tracked in git index!");
      console.error("   Run `git rm --cached .env` immediately and ensure .env is in .gitignore.");
      return false;
    }
  } catch (err) {
    // If git is not installed or not a repo, proceed with file-level checks
  }

  // Verify .gitignore explicitly contains .env
  const gitignorePath = path.join(ROOT_DIR, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    const lines = gitignoreContent.split(/\r?\n/).map(l => l.trim());
    if (!lines.includes(".env") && !lines.includes(".env*")) {
      console.error("❌ SECURITY FAILURE: .gitignore does not explicitly ignore .env!");
      return false;
    }
  }

  return true;
}

function scanDirectory(dir, forbiddenPlaceholders, violations) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      scanDirectory(fullPath, forbiddenPlaceholders, violations);
    } else if (entry.isFile()) {
      if (EXCLUDED_PATHS.has(fullPath)) continue;

      // Skip binary files and images
      const ext = path.extname(entry.name).toLowerCase();
      if ([".png", ".jpg", ".jpeg", ".ico", ".pdf", ".zip", ".tar", ".gz"].includes(ext)) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        for (const placeholder of forbiddenPlaceholders) {
          if (content.includes(placeholder)) {
            const relativePath = path.relative(ROOT_DIR, fullPath);
            violations.push({
              file: relativePath,
              placeholder
            });
          }
        }
      } catch (readErr) {
        // Skip unreadable files
      }
    }
  }
}

function runSecretsCheck() {
  console.log("🔒 Running TeamForge Secrets & Git Security Audit...\n");

  let hasErrors = false;

  // 1. Verify .env is not tracked in Git
  const gitCheck = checkGitTrackedEnv();
  if (!gitCheck) {
    hasErrors = true;
  } else {
    console.log("✓ Git tracking check passed: .env is properly gitignored and untracked.");
  }

  // 2. Scan repository files for secret placeholders from .env.example
  const forbiddenPlaceholders = getForbiddenPlaceholders();
  const violations = [];
  scanDirectory(ROOT_DIR, forbiddenPlaceholders, violations);

  if (violations.length > 0) {
    console.error("\n❌ SECURITY FAILURE: Found placeholder secret strings from .env.example in repository files:");
    violations.forEach(v => {
      console.error(`   - File: ${v.file} contains forbidden placeholder secret`);
    });
    console.error("\nAction required: Replace these placeholders with unique cryptographically random secrets.");
    hasErrors = true;
  } else {
    console.log("✓ Placeholder scan passed: No files contain default .env.example secret strings.");
  }

  if (hasErrors) {
    console.error("\n❌ Secrets audit FAILED.");
    process.exit(1);
  } else {
    console.log("\n✅ All secrets security checks PASSED.");
    process.exit(0);
  }
}

if (require.main === module) {
  runSecretsCheck();
}

module.exports = {
  checkGitTrackedEnv,
  getForbiddenPlaceholders,
  runSecretsCheck
};
