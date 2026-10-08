const express = require("express");
const app = express();
const ejsMate = require("ejs-mate");
const connectDB = require("./models/db");

const session = require("express-session");
const User = require("./models/User");

// Import Routes
const authRoutes = require("./routes/auth");
const indexRoutes = require("./routes/index");
const teamReqRoutes = require("./routes/teamRequirements");
const inviteRoutes = require("./routes/invites");
const applicationRoutes = require("./routes/applications");

// Connect to Database
connectDB();

// App Configurations
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

// Middleware
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "teamforge-secret-key-12345",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

// Global Current User Middleware (attaches user to req.user and res.locals.currentUser)
app.use(async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      req.user = user;
      res.locals.currentUser = user;
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

// Use Routes
app.use("/", authRoutes);
app.use("/", indexRoutes);
app.use("/team-requirement", teamReqRoutes);
app.use("/invites", inviteRoutes);
app.use("/applications", applicationRoutes);

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).send("Page Not Found");
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  const { status = 500, message = "Internal Server Error" } = err;
  console.error("Global Error Handler caught:", err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).send(`Validation Error: ${err.message}`);
  }

  res.status(status).send(message);
});

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
