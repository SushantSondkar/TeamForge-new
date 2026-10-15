const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const requireLogin = require("../middleware/auth");
const githubService = require("../utils/githubService");
const linkedinService = require("../utils/linkedinService");

// Basic Rate Limiter for Login and Signup (20 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts from this IP. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false
});

// Allowed college domain and academic lists
const ALLOWED_EMAIL_DOMAIN = "@kkwagh.edu.in";
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
    return res.redirect("/");
  }
  res.render("signup", { error: null, success: null, formData: {} });
});

// -------------------------------------------------------------
// 2. POST /signup - Register new user & collect year/dept/skills
// -------------------------------------------------------------
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, department, year, skillsRaw } = req.body;
    const formData = { name, email, department, year, skillsRaw };

    // Validations
    if (!name || !email || !password || !confirmPassword) {
      return res.render("signup", {
        error: "Name, email, and password fields are required.",
        success: null,
        formData
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Enforce @kkwagh.edu.in strictly on server-side
    if (!cleanEmail.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return res.render("signup", {
        error: `Only official college emails ending in ${ALLOWED_EMAIL_DOMAIN} are permitted to register.`,
        success: null,
        formData
      });
    }

    if (password !== confirmPassword) {
      return res.render("signup", {
        error: "Password and Confirm Password must match.",
        success: null,
        formData
      });
    }

    if (password.length < 6) {
      return res.render("signup", {
        error: "Password must be at least 6 characters long.",
        success: null,
        formData
      });
    }

    // Validate department & year against allowed values
    const cleanDept = department ? department.trim() : "";
    if (cleanDept && !ALLOWED_DEPARTMENTS.includes(cleanDept)) {
      return res.render("signup", {
        error: "Please select a valid college department from the list.",
        success: null,
        formData
      });
    }

    const cleanYear = year ? year.trim() : "";
    if (cleanYear && !ALLOWED_YEARS.includes(cleanYear)) {
      return res.render("signup", {
        error: "Please select a valid academic year (FE, SE, TE, or BE).",
        success: null,
        formData
      });
    }

    // Check duplicate email
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.render("signup", {
        error: "This college email is already registered. Please log in.",
        success: null,
        formData
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

    // Email verification token setup
    const verificationToken = crypto.randomBytes(24).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Mass-assignment guarded user instantiation
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
      isEmailVerified: true, // Non-blocking for local campus demonstration
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      lastActive: new Date()
    });

    await newUser.save();
    console.log(`New user registered: ${newUser.name} (${newUser.email})`);

    // Regenerate session to eliminate session-fixation risk on account creation
    req.session.regenerate((sessErr) => {
      if (sessErr) {
        console.error("Session regeneration error after signup:", sessErr);
      }
      req.session.userId = newUser._id;
      res.redirect("/profile?welcome=true");
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.render("signup", {
      error: "An unexpected error occurred during signup.",
      success: null,
      formData: req.body || {}
    });
  }
});

// -------------------------------------------------------------
// 3. GET /verify-email - Verify email with token
// -------------------------------------------------------------
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.render("login", { error: "Invalid or missing email verification token." });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.render("login", { error: "Email verification link is invalid or has expired." });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.render("login", {
      error: null,
      success: "Your college email has been verified successfully! You may now log in."
    });
  } catch (err) {
    console.error("Email verification error:", err.message);
    res.render("login", { error: "An error occurred during verification." });
  }
});

// -------------------------------------------------------------
// 4. GET /login - Render login form
// -------------------------------------------------------------
router.get("/login", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/");
  }
  res.render("login", { error: null, success: null });
});

// -------------------------------------------------------------
// 5. POST /login - Authenticate user & update lastActive
// -------------------------------------------------------------
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("login", { error: "Please enter both email and password.", success: null });
    }

    const cleanEmail = email.toLowerCase().trim();
    const genericAuthError = "Invalid college email or password.";

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.render("login", { error: genericAuthError, success: null });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: genericAuthError, success: null });
    }

    // Update lastActive timestamp on login
    user.lastActive = new Date();
    await user.save();

    // Regenerate session to eliminate session-fixation risk
    req.session.regenerate((sessErr) => {
      if (sessErr) {
        console.error("Session regeneration error:", sessErr);
        return res.render("login", { error: "Session creation error. Please try again.", success: null });
      }
      req.session.userId = user._id;
      console.log(`User logged in: ${user.name} (${user.email}) at ${user.lastActive}`);
      res.redirect("/");
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.render("login", { error: "An unexpected error occurred during login.", success: null });
  }
});

// -------------------------------------------------------------
// 6. GET /forgot-password - Render forgot password request form
// -------------------------------------------------------------
router.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, success: null });
});

// -------------------------------------------------------------
// 7. POST /forgot-password - Issue password reset token
// -------------------------------------------------------------
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.render("forgot-password", { error: "Please provide your registered college email.", success: null });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Avoid revealing user existence
      return res.render("forgot-password", {
        error: null,
        success: "If an account exists with this email, password reset instructions have been generated."
      });
    }

    const resetToken = crypto.randomBytes(24).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    console.log(`Password reset token generated for ${user.email}: ${resetToken}`);

    res.render("forgot-password", {
      error: null,
      success: `Reset link generated! Use token: /reset-password?token=${resetToken}`
    });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.render("forgot-password", { error: "Server error processing request.", success: null });
  }
});

// -------------------------------------------------------------
// 8. GET /reset-password - Render password reset form
// -------------------------------------------------------------
router.get("/reset-password", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect("/forgot-password");
  }

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() }
  });

  if (!user) {
    return res.render("forgot-password", { error: "Password reset link is invalid or has expired.", success: null });
  }

  res.render("reset-password", { token, error: null });
});

// -------------------------------------------------------------
// 9. POST /reset-password - Set new password
// -------------------------------------------------------------
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { token, newPassword, confirmNewPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.render("reset-password", { token, error: "New password must be at least 6 characters long." });
    }

    if (newPassword !== confirmNewPassword) {
      return res.render("reset-password", { token, error: "Passwords do not match." });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.render("forgot-password", { error: "Password reset token is invalid or has expired.", success: null });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.lastActive = new Date();
    await user.save();

    res.render("login", {
      error: null,
      success: "Password successfully updated. You may now log in with your new credentials."
    });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.render("reset-password", { token: req.body.token, error: "Server error resetting password." });
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
router.get("/auth/github", requireLogin, (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.githubOAuthState = state;

  const protocol = req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/auth/github/callback`;

  const authUrl = githubService.getAuthorizationUrl(state, redirectUri);
  res.redirect(authUrl);
});

// 12. GET /auth/github/callback - GitHub OAuth callback
router.get("/auth/github/callback", requireLogin, async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn("GitHub OAuth canceled or errored:", error, error_description);
      return res.redirect("/profile?error=" + encodeURIComponent(error_description || error));
    }

    if (!state || state !== req.session.githubOAuthState) {
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

    // Attach token to current user
    req.user.githubAccessToken = accessToken;

    // Pull profile, repos, languages, commit counts and cache them
    await githubService.syncUserGithubData(req.user, true);

    res.redirect("/profile?verified=github");
  } catch (err) {
    console.error("GitHub verification callback error:", err.message);
    res.redirect("/profile?error=" + encodeURIComponent(err.message));
  }
});

// 13. POST /auth/github/sync - Re-sync GitHub data (cache refresh)
router.post("/auth/github/sync", requireLogin, async (req, res) => {
  try {
    if (!req.user.isGithubVerified || !req.user.githubAccessToken) {
      return res.redirect("/profile?error=" + encodeURIComponent("GitHub account not linked."));
    }

    const result = await githubService.syncUserGithubData(req.user, true);
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
    req.user.githubAccessToken = "";
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
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.warn("LinkedIn OAuth error:", error, error_description);
      return res.redirect("/profile?error=" + encodeURIComponent(error_description || error));
    }

    if (!state || state !== req.session.linkedinOAuthState) {
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
