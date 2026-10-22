require("dotenv").config();

// 1. Startup Environment & Security Validation (Called first in app.js)
const { assertValidEnv } = require("./utils/validateEnv");
assertValidEnv();

const express = require("express");
const path = require("path");
const app = express();
const helmet = require("helmet");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const cookieParser = require("cookie-parser");
const csurf = require("tiny-csrf");

// Enforce mandatory SMTP configuration in production (secondary check)
const { validateMailerConfig } = require("./utils/mailer");
try {
  validateMailerConfig();
} catch (err) {
  console.error(`FATAL ERROR: ${err.message}`);
  process.exit(1);
}

const mongoose = require("mongoose");
const connectDB = require("./models/db");
const User = require("./models/User");
const Notification = require("./models/Notification");

// Import Routes
const authRoutes = require("./routes/auth");
const indexRoutes = require("./routes/index");
const teamReqRoutes = require("./routes/teamRequirements");
const inviteRoutes = require("./routes/invites");
const applicationRoutes = require("./routes/applications");
const eventRoutes = require("./routes/events");
const reviewRoutes = require("./routes/reviews");
const leaderboardRoutes = require("./routes/leaderboard");
const organizerRoutes = require("./routes/organizers");
const adminRoutes = require("./routes/admin");
const feedbackRoutes = require("./routes/feedback");
const Announcement = require("./models/Announcement");

const { startScheduler } = require("./utils/scheduler");

// Connect to Database and start scheduled daemon
connectDB().then(() => {
  startScheduler();
}).catch(err => {
  console.error("Database connection failed:", err.message);
});

// Trust reverse proxy in production (Render, Railway, NGINX, Cloudflare)
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

// Helmet Security Headers & Content Security Policy (CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Health Check Endpoint (Platform health checks: Render, Railway, Kubernetes)
app.get("/healthz", (req, res) => {
  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = dbStates[mongoose.connection.readyState] || "unknown";
  const isHealthy = mongoose.connection.readyState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    database: dbState
  });
});

// App Configurations
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

// Static files
// Serve /images with long Cache-Control (immutable 30-day cache)
app.use("/images", express.static(path.join(__dirname, "public", "images"), {
  maxAge: "30d",
  immutable: true
}));
app.use(express.static(path.join(__dirname, "public")));

// Request Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie Parser (CSRF dependency)
const cookieSecret = (process.env.COOKIE_SECRET || process.env.SESSION_SECRET || "teamforge-cookie-secret-32-chars!").slice(0, 32).padEnd(32, "x");
app.use(cookieParser(cookieSecret));

// Persistent Session Store via MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    clientPromise: connectDB().then(m => m.connection.getClient()),
    collectionName: "sessions",
    ttl: 24 * 60 * 60 // 24 hours
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction
  }
}));

// CSRF Header-to-Body Adapter for AJAX / fetch
app.use((req, res, next) => {
  if (req.body && !req.body._csrf && req.headers["x-csrf-token"]) {
    req.body._csrf = req.headers["x-csrf-token"];
  }
  next();
});

// Extend CSRF cookie lifetime to match session (24h) with sameSite: lax (Safari friendly)
app.use((req, res, next) => {
  const origCookie = res.cookie.bind(res);
  res.cookie = function (name, val, options) {
    if (name === "csrfToken" && val !== null) {
      options = Object.assign({}, options, {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours (prevents 5-min timeout)
        sameSite: "lax",
        httpOnly: true,
        secure: isProduction
      });
    }
    return origCookie(name, val, options);
  };
  next();
});

// CSRF Protection via tiny-csrf (32-character secret)
// Intermediate wizard steps are excluded from strict token verification so back/forward navigation never drops,
// while final actions (/team-requirement/submit, /login, /signup, etc.) remain strictly validated.
const csrfSecret = (process.env.CSRF_SECRET || process.env.SESSION_SECRET).slice(0, 32).padEnd(32, "0");
const wizardIntermediateUrls = [
  "/team-requirement/new",
  "/team-requirement/new/define-team",
  "/team-requirement/new/open-roles",
  "/team-requirement/new/review"
];
app.use(csurf(csrfSecret, ["POST", "PUT", "PATCH", "DELETE"], wizardIntermediateUrls));

// Global Current User & CSRF Token Middleware
app.use(async (req, res, next) => {
  // Supply csrfToken to all view renders
  try {
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : "";
  } catch (err) {
    res.locals.csrfToken = "";
  }

  // Expose OAuth configuration status to views so Connect buttons can be hidden when keys are missing
  res.locals.isGithubOAuthConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  res.locals.isLinkedinOAuthConfigured = Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);

  // Expose application base URL and current path for SEO, Open Graph and brand asset references
  res.locals.appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
  res.locals.currentPath = req.path || "";
  res.locals.supportEmail = (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim()) ? process.env.SUPPORT_EMAIL.trim() : null;

  // Active Pinned Announcement for Dashboard (Event-Day Banner)
  try {
    res.locals.activeAnnouncement = await Announcement.findOne({ active: true, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  } catch (err) {
    res.locals.activeAnnouncement = null;
  }

  // Session Flash Messages (transient success / error alerts)
  res.locals.success = (req.session && req.session.success) || (req.query && req.query.success) || null;
  res.locals.error = (req.session && req.session.error) || (req.query && req.query.error) || null;
  if (req.session) {
    delete req.session.success;
    delete req.session.error;
  }

  res.locals.unreadNotificationCount = 0;

  // Hide sidebar and title bar nav options on authentication pages
  const isAuthPage = ["/signup", "/login", "/forgot-password", "/reset-password", "/verify-email", "/check-inbox", "/resend-verification"].some(p => req.path === p || req.path.startsWith(p + "/"));
  if (isAuthPage) {
    res.locals.hideSidebar = true;
    res.locals.hideNavOptions = true;
  }

  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (user) {
        // Invalidate older session if password was changed after session creation
        if (user.passwordChangedAt && req.session.createdAt && new Date(req.session.createdAt) < new Date(user.passwordChangedAt)) {
          req.session.destroy(() => {});
          req.user = null;
          res.locals.currentUser = null;
          return next();
        }

        // Update lastActive on authenticated actions (throttled to 60s)
        const now = new Date();
        if (!user.lastActive || (now - new Date(user.lastActive)) > 60000) {
          user.lastActive = now;
          await user.save();
        }
        req.user = user;
        res.locals.currentUser = user;

        // Compute unread notifications count for badge display
        try {
          res.locals.unreadNotificationCount = await Notification.countDocuments({ userId: user._id, read: false });
        } catch (e) {
          res.locals.unreadNotificationCount = 0;
        }
      } else {
        req.user = null;
        res.locals.currentUser = null;
        res.locals.unreadNotificationCount = 0;
      }
    } catch (err) {
      req.user = null;
      res.locals.currentUser = null;
      res.locals.unreadNotificationCount = 0;
    }
  } else {
    req.user = null;
    res.locals.currentUser = null;
    res.locals.unreadNotificationCount = 0;
  }
  next();
});

// Mount Routes
app.use("/", authRoutes);
app.use("/", indexRoutes);
app.use("/team-requirement", teamReqRoutes);
app.use("/invites", inviteRoutes);
app.use("/applications", applicationRoutes);
app.use("/events", eventRoutes);
app.use("/reviews", reviewRoutes);
app.use("/", reviewRoutes);
app.use("/leaderboard", leaderboardRoutes);
app.use("/", organizerRoutes);
app.use("/", adminRoutes);
app.use("/", feedbackRoutes);

// 404 Route Handler - Friendly Error Page
app.use((req, res, next) => {
  res.status(404).render("404", {
    currentUser: req.user || null,
    pageTitle: "404 - Page Not Found"
  });
});

// Global Error Handling Middleware - Friendly 500 Page
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CSRF token")) {
    console.warn("CSRF Warning:", err.message);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(403).json({ error: "Session token expired. Please refresh and try again." });
    }

    let redirectUrl = "/";
    if (req.headers.referer) {
      try {
        const parsed = new URL(req.headers.referer);
        if (parsed.host === req.get("host")) {
          redirectUrl = parsed.pathname + parsed.search;
        }
      } catch (e) {
        if (req.headers.referer.startsWith("/") && !req.headers.referer.startsWith("//")) {
          redirectUrl = req.headers.referer;
        }
      }
    }
    return res.redirect(redirectUrl);
  }

  console.error("Global Error Handler caught:", err);
  
  if (err.name === "ValidationError") {
    return res.status(400).send(`Validation Error: ${err.message}`);
  }

  const status = typeof err.status === "number" ? err.status : 500;
  res.status(status).render("500", {
    currentUser: req.user || null,
    pageTitle: "Server Error · TeamForge",
    errorMessage: process.env.NODE_ENV === "production" ? "Something went wrong on our end. Please try again in a few moments." : err.message
  });
});

// Start Server
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
