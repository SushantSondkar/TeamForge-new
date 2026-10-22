const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const mongoose = require("mongoose");
const requireLogin = require("../middleware/auth");
const githubService = require("../utils/githubService");
const linkedinService = require("../utils/linkedinService");
const { sendMail } = require("../utils/mailer");
const {
  verifyEmail: verifyEmailTemplate,
  resetPassword: resetPasswordTemplate,
  passwordChanged: passwordChangedTemplate
} = require("../utils/emailTemplates");

// Basic Rate Limiter for Login, Signup, and Verification (20 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts from this IP. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false
});

// Per-email rate limiter for password reset requests (max 3 requests per hour per email)
const resetEmailAttempts = new Map();

function checkEmailResetLimit(email) {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.toLowerCase().trim();
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  const timestamps = (resetEmailAttempts.get(cleanEmail) || []).filter(t => now - t < oneHour);

  if (timestamps.length >= 3) {
    return false; // Limit hit
  }

  timestamps.push(now);
  resetEmailAttempts.set(cleanEmail, timestamps);
  return true;
}

// Prune expired rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [key, times] of resetEmailAttempts.entries()) {
    const valid = times.filter(t => now - t < oneHour);
    if (valid.length === 0) {
      resetEmailAttempts.delete(key);
    } else {
      resetEmailAttempts.set(key, valid);
    }
  }
}, 15 * 60 * 1000).unref();

/**
 * Password Policy Enforcement:
 * Minimum 8 characters, at least one letter, and at least one number.
 */
function isValidPasswordPolicy(password) {
  if (!password || typeof password !== "string") return false;
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

/**
 * Invalidate all existing sessions for a user across MongoDB connect-mongo collection.
 */
async function invalidateUserSessions(userId) {
  if (!userId) return;
  try {
    const db = mongoose.connection.db;
    if (db) {
      const sessionsColl = db.collection("sessions");
      const idStr = String(userId);
      await sessionsColl.deleteMany({
        $or: [
          { "session.userId": idStr },
          { session: { $regex: `"userId":"${idStr}"` } }
        ]
      });
    }
  } catch (err) {
    console.warn("Could not delete sessions from database collection:", err.message);
  }
}

// Allowed college domain configuration & helpers
function getAllowedDomain() {
  const envDomain = process.env.ALLOWED_DOMAIN ? process.env.ALLOWED_DOMAIN.trim() : "";
  const clean = envDomain.startsWith("@") ? envDomain.slice(1) : envDomain;
  return (clean || "kkwagh.edu.in").toLowerCase();
}

/**
 * Validate institutional email strictly against ALLOWED_DOMAIN.
 * Compares case-insensitively and exactly against the part after the last "@".
 * Rejects lookalikes such as x@kkwagh.edu.in.evil.com or x@evilkkwagh.edu.in.
 */
function isAllowedCollegeEmail(email) {
  if (!email || typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  const lastAtIndex = clean.lastIndexOf("@");
  if (lastAtIndex <= 0) return false;

  const localPart = clean.slice(0, lastAtIndex);
  const domainPart = clean.slice(lastAtIndex + 1);

  if (!localPart || !domainPart) return false;
  return domainPart === getAllowedDomain();
}

/**
 * Compute SHA-256 hash of a raw token.
 */
function hashToken(token) {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Generate 32-byte crypto random verification token and its SHA-256 hash.
 */
function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
}

const ALLOWED_DEPARTMENTS = [
  "Computer Engineering",
  "Information Technology",
  "AI & Data Science",
  "Electronics & Telecom",
  "Mechanical Engineering",
  "Civil Engineering",
  "Chemical Engineering"
];
const ALLOWED_YEARS = ["FE", "SE", "TE", "BE"];

// -------------------------------------------------------------
// 1. GET /signup - Render signup form
// -------------------------------------------------------------
router.get("/signup", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.render("signup", {
    error: null,
    success: null,
    formData: {},
    allowedDomain: getAllowedDomain()
  });
});

// -------------------------------------------------------------
// 2. POST /signup - Register new user & collect year/dept/skills
// -------------------------------------------------------------
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, department, year, skillsRaw } = req.body;
    const formData = { name, email, department, year, skillsRaw };

    // Validations & strict type checks
    if (
      !name ||
      !email ||
      !password ||
      !confirmPassword ||
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.render("signup", {
        error: "Name, email, and password fields are required.",
        success: null,
        formData,
        allowedDomain: getAllowedDomain()
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const allowedDomain = getAllowedDomain();

    // Enforce allowed college domain strictly on server-side
    if (!isAllowedCollegeEmail(cleanEmail)) {
      return res.render("signup", {
        error: `Only official college emails ending exactly in @${allowedDomain} are permitted to register.`,
        success: null,
        formData,
        allowedDomain
      });
    }

    if (password !== confirmPassword) {
      return res.render("signup", {
        error: "Password and Confirm Password must match.",
        success: null,
        formData,
        allowedDomain
      });
    }

    if (!isValidPasswordPolicy(password)) {
      return res.render("signup", {
        error: "Password must be at least 8 characters long and contain at least one letter and one number.",
        success: null,
        formData,
        allowedDomain
      });
    }

    // Validate department & year against allowed values
    const cleanDept = department ? department.trim() : "";
    if (cleanDept && !ALLOWED_DEPARTMENTS.includes(cleanDept)) {
      return res.render("signup", {
        error: "Please select a valid college department from the list.",
        success: null,
        formData,
        allowedDomain
      });
    }

    const cleanYear = year ? year.trim() : "";
    if (cleanYear && !ALLOWED_YEARS.includes(cleanYear)) {
      return res.render("signup", {
        error: "Please select a valid academic year (FE, SE, TE, or BE).",
        success: null,
        formData,
        allowedDomain
      });
    }

    // Check duplicate email
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.render("signup", {
        error: "This college email is already registered. Please log in.",
        success: null,
        formData,
        allowedDomain
      });
    }

    // Parse & validate initial skills (format: "React:4, Node.js:5" or array)
    let parsedSkills = [];
    if (skillsRaw) {
      try {
        if (typeof skillsRaw === "string" && skillsRaw.trim().startsWith("[")) {
          const rawArr = JSON.parse(skillsRaw);
          if (Array.isArray(rawArr)) {
            parsedSkills = rawArr.map(s => ({
              name: String(s.name || "").trim().slice(0, 50),
              level: Math.min(5, Math.max(1, parseInt(s.level, 10) || 3))
            })).filter(s => s.name.length > 0);
          }
        } else if (typeof skillsRaw === "string") {
          parsedSkills = skillsRaw.split(",").map(item => {
            const parts = item.split(":");
            const skillName = parts[0] ? parts[0].trim().slice(0, 50) : "";
            const skillLevel = Math.min(5, Math.max(1, parseInt(parts[1], 10) || 3));
            return {
              name: skillName,
              level: skillLevel
            };
          }).filter(s => s.name.length > 0);
        }
      } catch (e) {
        console.warn("Could not parse initial skills in signup:", e.message);
      }
    }

    // Hash password securely via bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Email verification token setup: generate 32-byte crypto token, store ONLY SHA-256 hash in DB
    const { rawToken, hashedToken } = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Mass-assignment guarded user instantiation (isEmailVerified: false)
    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      department: cleanDept,
      year: cleanYear,
      skills: parsedSkills,
      role: "Candidate",
      availability: 1.0,
      credibility: 0.5,
      teammateRating: 0.5,
      isProfileHidden: false,
      isAdmin: false,
      isOrganizer: false,
      organizerStatus: "NONE",
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: verificationExpires,
      lastActive: new Date()
    });

    await newUser.save();
    console.log(`New user registered (pending verification): user ID ${newUser._id}`);

    // Send verification email with raw token link (raw token exists only in emailed link)
    try {
      const emailContent = verifyEmailTemplate({
        name: newUser.name,
        token: rawToken
      });
      await sendMail({
        to: newUser.email,
        ...emailContent
      });
    } catch (mailErr) {
      console.error("Failed to send signup verification email:", mailErr.message);
    }

    // Redirect to check-inbox page (do NOT create session or log in automatically)
    return res.redirect(`/check-inbox?email=${encodeURIComponent(cleanEmail)}`);
  } catch (err) {
    console.error("Signup error:", err);
    res.render("signup", {
      error: "An unexpected error occurred during signup.",
      success: null,
      formData: req.body || {},
      allowedDomain: getAllowedDomain()
    });
  }
});

// -------------------------------------------------------------
// 2B. GET /check-inbox - Display "Check your inbox" screen
// -------------------------------------------------------------
router.get("/check-inbox", (req, res) => {
  const email = req.query.email ? req.query.email.trim() : "";
  res.render("check-inbox", {
    email,
    message: null,
    error: null,
    allowedDomain: getAllowedDomain()
  });
});

// -------------------------------------------------------------
// 3. GET /verify-email - Verify email with token
// -------------------------------------------------------------
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.render("verify-email", {
        success: false,
        error: "Verification token is missing or invalid.",
        email: "",
        allowedDomain: getAllowedDomain()
      });
    }

    // Hash the incoming raw token to match stored SHA-256 hash
    const hashedToken = hashToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.render("verify-email", {
        success: false,
        error: "Email verification link is invalid or has expired.",
        email: "",
        allowedDomain: getAllowedDomain()
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    console.log(`Email successfully verified for user ID ${user._id}`);

    return res.render("verify-email", {
      success: true,
      error: null,
      email: user.email,
      allowedDomain: getAllowedDomain()
    });
  } catch (err) {
    console.error("Email verification error:", err.message);
    return res.render("verify-email", {
      success: false,
      error: "An unexpected error occurred during verification.",
      email: "",
      allowedDomain: getAllowedDomain()
    });
  }
});

// -------------------------------------------------------------
// 3B. POST /resend-verification - Issue fresh verification token
// -------------------------------------------------------------
router.post("/resend-verification", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.render("check-inbox", {
        email: "",
        message: genericMessage,
        error: null,
        allowedDomain: getAllowedDomain()
      });
    }
    const cleanEmail = email.toLowerCase().trim();
    const genericMessage = "If an account with that college email exists and is not yet verified, a new verification link has been sent to your inbox.";

    if (cleanEmail && isAllowedCollegeEmail(cleanEmail)) {
      const user = await User.findOne({ email: cleanEmail });
      if (user && !user.isEmailVerified) {
        const { rawToken, hashedToken } = generateVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await user.save();

        try {
          const emailContent = verifyEmailTemplate({
            name: user.name,
            token: rawToken
          });
          await sendMail({
            to: user.email,
            ...emailContent
          });
        } catch (mailErr) {
          console.error("Failed to send verification email on resend:", mailErr.message);
        }
      }
    }

    // Always respond with the same generic message (prevents user enumeration)
    return res.render("check-inbox", {
      email: cleanEmail,
      message: genericMessage,
      error: null,
      allowedDomain: getAllowedDomain()
    });
  } catch (err) {
    console.error("Resend verification error:", err.message);
    return res.render("check-inbox", {
      email: req.body.email || "",
      message: "If an account with that college email exists and is not yet verified, a new verification link has been sent to your inbox.",
      error: null,
      allowedDomain: getAllowedDomain()
    });
  }
});

// -------------------------------------------------------------
// 4. GET /login - Render login form
// -------------------------------------------------------------
router.get("/login", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.render("login", {
    error: null,
    success: null,
    showResend: false,
    unverifiedEmail: ""
  });
});

// -------------------------------------------------------------
// 5. POST /login - Authenticate user & update lastActive
// -------------------------------------------------------------
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.render("login", {
        error: "Please enter both email and password.",
        success: null,
        showResend: false,
        unverifiedEmail: ""
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const genericAuthError = "Invalid college email or password.";

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.render("login", {
        error: genericAuthError,
        success: null,
        showResend: false,
        unverifiedEmail: ""
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", {
        error: genericAuthError,
        success: null,
        showResend: false,
        unverifiedEmail: ""
      });
    }

    // Block unverified accounts from creating a session
    if (!user.isEmailVerified) {
      return res.render("login", {
        error: "Please verify your email first. Check your inbox for the verification link.",
        success: null,
        showResend: true,
        unverifiedEmail: user.email
      });
    }

    // Update lastActive timestamp on login
    user.lastActive = new Date();
    await user.save();

    // Regenerate session to eliminate session-fixation risk
    req.session.regenerate((sessErr) => {
      if (sessErr) {
        console.error("Session regeneration error:", sessErr);
        return res.render("login", {
          error: "Session creation error. Please try again.",
          success: null,
          showResend: false,
          unverifiedEmail: ""
        });
      }
      req.session.userId = user._id;
      req.session.createdAt = new Date();
      console.log(`User logged in: user ID ${user._id} at ${user.lastActive}`);
      res.redirect("/dashboard");
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.render("login", {
      error: "An unexpected error occurred during login.",
      success: null,
      showResend: false,
      unverifiedEmail: ""
    });
  }
});

// -------------------------------------------------------------
// 6. GET /forgot-password - Render forgot password request form
// -------------------------------------------------------------
router.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, success: null });
});

// -------------------------------------------------------------
// 7. POST /forgot-password - Issue password reset token securely
// -------------------------------------------------------------
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const genericSuccess = "If an account exists for this email, we've sent a reset link.";

    if (!email || typeof email !== "string") {
      return res.render("forgot-password", {
        error: "Please provide your registered college email.",
        success: null
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Per-email rate limit check: max 3 requests per hour per email
    // Without revealing that the limit was hit!
    const isUnderLimit = checkEmailResetLimit(cleanEmail);
    if (!isUnderLimit) {
      return res.render("forgot-password", {
        error: null,
        success: genericSuccess
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    // Only issue token & send reset link if user exists AND isEmailVerified is true
    if (user && user.isEmailVerified) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = hashToken(rawToken);

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await user.save();

      try {
        const emailContent = resetPasswordTemplate({
          name: user.name,
          token: rawToken
        });
        await sendMail({
          to: user.email,
          ...emailContent
        });
      } catch (mailErr) {
        console.error("Failed to send password reset email:", mailErr.message);
      }
    }

    // Always respond with the exact same generic message (prevents user enumeration).
    // Never show the token or link on the page, never log token to console.
    return res.render("forgot-password", {
      error: null,
      success: genericSuccess
    });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    return res.render("forgot-password", {
      error: null,
      success: "If an account exists for this email, we've sent a reset link."
    });
  }
});

// -------------------------------------------------------------
// 8. GET /reset-password - Render password reset form
// -------------------------------------------------------------
router.get("/reset-password", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.render("forgot-password", {
      error: "Password reset link is invalid or has expired.",
      success: null
    });
  }

  // Hash incoming raw token before database query
  const hashedToken = hashToken(token);
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() }
  });

  if (!user) {
    return res.render("forgot-password", {
      error: "Password reset link is invalid or has expired.",
      success: null
    });
  }

  res.render("reset-password", { token: token.trim(), error: null });
});

// -------------------------------------------------------------
// 9. POST /reset-password - Set new password
// -------------------------------------------------------------
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { token, newPassword, confirmNewPassword } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.render("forgot-password", {
        error: "Password reset link is invalid or has expired.",
        success: null
      });
    }

    // Password policy: minimum 8 characters, at least one letter, and at least one number
    if (!isValidPasswordPolicy(newPassword)) {
      return res.render("reset-password", {
        token: token.trim(),
        error: "Password must be at least 8 characters long and contain at least one letter and one number."
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.render("reset-password", {
        token: token.trim(),
        error: "Passwords do not match."
      });
    }

    // Hash incoming token before lookup
    const hashedToken = hashToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.render("forgot-password", {
        error: "Password reset link is invalid or has expired.",
        success: null
      });
    }

    // Set new password bcrypt hash
    user.password = await bcrypt.hash(newPassword, 10);

    // Clear token and expiry (token must work exactly once)
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.passwordChangedAt = new Date();
    user.lastActive = new Date();
    await user.save();

    // Invalidate user's other sessions across connect-mongo collection
    await invalidateUserSessions(user._id);

    // Send "your password was changed" confirmation email
    try {
      const emailContent = passwordChangedTemplate({
        name: user.name
      });
      await sendMail({
        to: user.email,
        ...emailContent
      });
    } catch (mailErr) {
      console.error("Failed to send password changed confirmation email:", mailErr.message);
    }

    return res.render("login", {
      error: null,
      success: "Password successfully updated. You may now log in with your new credentials.",
      showResend: false,
      unverifiedEmail: ""
    });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.render("reset-password", {
      token: req.body.token || "",
      error: "An unexpected error occurred while resetting your password."
    });
  }
});

// -------------------------------------------------------------
// 10. POST /logout - Strictly POST-only logout
// -------------------------------------------------------------
router.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout session destroy error:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

// =============================================================
// PHASE 6: GITHUB OAUTH & VERIFICATION ROUTES
// =============================================================

// 11. GET /auth/github - Initiate GitHub OAuth flow
router.get("/auth/github", requireLogin, async (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    // If OAuth app keys are not configured, auto-verify via GitHub REST API if username/URL is available
    const rawTarget = req.user.githubUsername || req.user.github;
    if (rawTarget && rawTarget.trim()) {
      try {
        await githubService.syncUserGithubData(req.user, null, true);
        return res.redirect("/profile?verified=github");
      } catch (err) {
        console.error("Direct GitHub verification error:", err.message);
        return res.redirect("/profile?error=" + encodeURIComponent("Could not verify GitHub profile: " + err.message));
      }
    }
    return res.redirect("/profile?prompt=github");
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.githubOAuthState = state;

  const protocol = req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/auth/github/callback`;

  const authUrl = githubService.getAuthorizationUrl(state, redirectUri);
  res.redirect(authUrl);
});

// 11b. POST /auth/github/verify - Direct Public REST API Verification & Sync
router.post("/auth/github/verify", requireLogin, async (req, res) => {
  try {
    let inputUser = req.body.githubUsername || req.body.github || req.user.githubUsername || req.user.github;
    if (!inputUser || !inputUser.trim()) {
      return res.redirect("/profile?error=" + encodeURIComponent("Please provide a GitHub username or profile URL."));
    }

    const cleanUsername = githubService.cleanGithubUsername(inputUser);
    if (!cleanUsername) {
      return res.redirect("/profile?error=" + encodeURIComponent("Invalid GitHub username or URL."));
    }

    req.user.githubUsername = cleanUsername;
    if (!req.user.github || req.user.github.trim() === "" || githubService.cleanGithubUsername(req.user.github) === cleanUsername) {
      req.user.github = `https://github.com/${cleanUsername}`;
    }

    const result = await githubService.syncUserGithubData(req.user, null, true);
    if (result.rateLimited) {
      return res.redirect("/profile?warning=" + encodeURIComponent("GitHub API rate limit reached. Displaying cached data."));
    }

    res.redirect("/profile?verified=github");
  } catch (err) {
    console.error("GitHub verification error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent("GitHub verification failed: " + err.message));
  }
});

// 12. GET /auth/github/callback - GitHub OAuth callback
router.get("/auth/github/callback", requireLogin, async (req, res) => {
  try {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.status(200).render("oauth-unavailable", {
        serviceName: "GitHub",
        message: "This verification is not available right now."
      });
    }

    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn("GitHub OAuth canceled or errored:", error, error_description);
      return res.redirect("/profile?error=" + encodeURIComponent(error_description || error));
    }

    if (!state || !req.session.githubOAuthState || state !== req.session.githubOAuthState) {
      delete req.session.githubOAuthState;
      console.warn("GitHub OAuth state mismatch. Possible CSRF.");
      return res.redirect("/profile?error=" + encodeURIComponent("Security check failed. State parameter mismatch."));
    }

    // Clear state
    delete req.session.githubOAuthState;

    const protocol = req.protocol;
    const host = req.get("host");
    const redirectUri = `${protocol}://${host}/auth/github/callback`;

    // Exchange code for token
    const tokenData = await githubService.exchangeCodeForToken(code, redirectUri);
    const accessToken = tokenData.access_token;

    // Pull profile, repos, languages, commit counts and cache them in memory - do NOT store accessToken in DB
    await githubService.syncUserGithubData(req.user, accessToken, true);

    res.redirect("/profile?verified=github");
  } catch (err) {
    console.error("GitHub verification callback error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

// 13. POST /auth/github/sync - Re-sync GitHub data (cache refresh)
router.post("/auth/github/sync", requireLogin, async (req, res) => {
  try {
    if (!req.user.isGithubVerified && !req.user.githubUsername && !req.user.github) {
      return res.redirect("/profile?error=" + encodeURIComponent("GitHub account not linked."));
    }

    const result = await githubService.syncUserGithubData(req.user, null, true);
    if (result.rateLimited) {
      return res.redirect("/profile?warning=" + encodeURIComponent("GitHub API is rate limited. Displaying cached data."));
    }

    res.redirect("/profile?synced=github");
  } catch (err) {
    console.error("GitHub sync error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

// 14. POST /auth/github/unlink - Unlink GitHub account
router.post("/auth/github/unlink", requireLogin, async (req, res) => {
  try {
    req.user.isGithubVerified = false;
    req.user.githubId = "";
    req.user.githubUsername = "";
    req.user.githubData = {
      reposCount: 0,
      totalCommits: 0,
      languages: [],
      topRepos: [],
      cachedAt: null,
      rateLimitedUntil: null
    };
    await req.user.save();

    res.redirect("/profile?unlinked=github");
  } catch (err) {
    console.error("GitHub unlink error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

// =============================================================
// PHASE 6: LINKEDIN OAUTH ROUTES (Honest "Linked" Label Only)
// =============================================================

// 15. GET /auth/linkedin - Initiate LinkedIn OAuth flow
router.get("/auth/linkedin", requireLogin, (req, res) => {
  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    return res.status(200).render("oauth-unavailable", {
      serviceName: "LinkedIn",
      message: "This verification is not available right now."
    });
  }

  const state = crypto.randomBytes(16).toString("hex");
  req.session.linkedinOAuthState = state;

  const protocol = req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/auth/linkedin/callback`;

  const authUrl = linkedinService.getAuthorizationUrl(state, redirectUri);
  res.redirect(authUrl);
});

// 16. GET /auth/linkedin/callback - LinkedIn OAuth callback
router.get("/auth/linkedin/callback", requireLogin, async (req, res) => {
  try {
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
      return res.status(200).render("oauth-unavailable", {
        serviceName: "LinkedIn",
        message: "This verification is not available right now."
      });
    }

    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn("LinkedIn OAuth error:", error, error_description);
      return res.redirect("/profile?error=" + encodeURIComponent(error_description || error));
    }

    if (!state || !req.session.linkedinOAuthState || state !== req.session.linkedinOAuthState) {
      delete req.session.linkedinOAuthState;
      console.warn("LinkedIn OAuth state mismatch.");
      return res.redirect("/profile?error=" + encodeURIComponent("Security check failed. State parameter mismatch."));
    }

    delete req.session.linkedinOAuthState;

    const protocol = req.protocol;
    const host = req.get("host");
    const redirectUri = `${protocol}://${host}/auth/linkedin/callback`;

    const tokenData = await linkedinService.exchangeCodeForToken(code, redirectUri);
    const userInfo = await linkedinService.fetchUserInfo(tokenData.access_token);

    // Assign "LinkedIn Linked" honest trust badge
    req.user.isLinkedinLinked = true;
    req.user.linkedinId = String(userInfo.sub || userInfo.id || "");
    if (!req.user.linkedin && userInfo.vanityName) {
      req.user.linkedin = `https://www.linkedin.com/in/${userInfo.vanityName}`;
    }

    await req.user.save();

    res.redirect("/profile?verified=linkedin");
  } catch (err) {
    console.error("LinkedIn verification callback error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

// 17. POST /auth/linkedin/unlink - Unlink LinkedIn
router.post("/auth/linkedin/unlink", requireLogin, async (req, res) => {
  try {
    req.user.isLinkedinLinked = false;
    req.user.linkedinId = "";
    await req.user.save();

    res.redirect("/profile?unlinked=linkedin");
  } catch (err) {
    console.error("LinkedIn unlink error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

module.exports = router;
module.exports.getAllowedDomain = getAllowedDomain;
module.exports.isAllowedCollegeEmail = isAllowedCollegeEmail;
module.exports.hashToken = hashToken;
module.exports.generateVerificationToken = generateVerificationToken;
module.exports.checkEmailResetLimit = checkEmailResetLimit;
module.exports.isValidPasswordPolicy = isValidPasswordPolicy;
module.exports.invalidateUserSessions = invalidateUserSessions;
module.exports.resetEmailAttempts = resetEmailAttempts;

