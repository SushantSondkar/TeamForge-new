require("dotenv").config();

const express = require("express");
const app = express();
const ejsMate = require("ejs-mate");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const cookieParser = require("cookie-parser");
const csurf = require("tiny-csrf");

// Enforce mandatory SESSION_SECRET
if (!process.env.SESSION_SECRET) {
  console.error("FATAL ERROR: SESSION_SECRET is not set in the environment variables. The server cannot start.");
  process.exit(1);
}

const mongoose = require("mongoose");
const connectDB = require("./models/db");
const User = require("./models/User");

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

// Connect to Database
connectDB();

// App Configurations
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

// Trust reverse proxy in production (e.g., NGINX, Cloudflare)
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

// Static files
app.use(express.static("public"));

// Request Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (user) {
        // Update lastActive on authenticated actions (throttled to 60s)
        const now = new Date();
        if (!user.lastActive || (now - new Date(user.lastActive)) > 60000) {
          user.lastActive = now;
          await user.save();
        }
        req.user = user;
        res.locals.currentUser = user;
      } else {
        req.user = null;
        res.locals.currentUser = null;
      }
    } catch (err) {
      req.user = null;
      res.locals.currentUser = null;
    }
  } else {
    req.user = null;
    res.locals.currentUser = null;
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

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).render("home", {
    latestTeam: null,
    recommendedCandidates: [],
    recommendedOpportunities: [],
    myApplications: [],
    teamApplicationCount: 0,
    sentInvites: [],
    receivedInvites: [],
    promotedEvents: [],
    currentUser: req.user || null,
    error: "404 - Page Not Found"
  });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CSRF token")) {
    console.warn("CSRF Warning:", err.message);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(403).json({ error: "Session token expired. Please refresh and try again." });
    }
    const redirectUrl = req.headers.referer || "/";
    return res.redirect(redirectUrl);
  }

  console.error("Global Error Handler caught:", err);
  
  if (err.name === "ValidationError") {
    return res.status(400).send(`Validation Error: ${err.message}`);
  }

  const { status = 500, message = "Internal Server Error" } = err;
  res.status(status).send(message);
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
