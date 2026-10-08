const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// -------------------------------------------------------------
// 1. GET /signup - Render signup form
// -------------------------------------------------------------
router.get("/signup", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/");
  }
  res.render("signup", { error: null });
});

// -------------------------------------------------------------
// 2. POST /signup - Register new user & auto-login
// -------------------------------------------------------------
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Basic Validations
    if (!name || !email || !password || !confirmPassword) {
      return res.render("signup", { error: "All fields are required." });
    }

    if (password !== confirmPassword) {
      return res.render("signup", { error: "Password and Confirm Password must match." });
    }

    if (password.length < 6) {
      return res.render("signup", { error: "Password must be at least 6 characters long." });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.render("signup", { error: "Email already registered." });
    }

    // Hash password with bcryptjs
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create and save new user
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "Candidate",
      availability: 1.0,
      credibility: 0.5,
      teammateRating: 0.5
    });

    await newUser.save();
    console.log(`New user registered: ${newUser.name} (${newUser.email})`);

    // Automatic login via session
    req.session.userId = newUser._id;
    res.redirect("/");
  } catch (err) {
    console.error("Signup error:", err.message);
    res.render("signup", { error: "An unexpected error occurred during signup." });
  }
});

// -------------------------------------------------------------
// 3. GET /login - Render login form
// -------------------------------------------------------------
router.get("/login", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
});

// -------------------------------------------------------------
// 4. POST /login - Authenticate user credentials
// -------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("login", { error: "Please enter both email and password." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.render("login", { error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Invalid email or password." });
    }

    // Session authentication
    req.session.userId = user._id;
    console.log(`User logged in: ${user.name} (${user.email})`);

    res.redirect("/");
  } catch (err) {
    console.error("Login error:", err.message);
    res.render("login", { error: "An unexpected error occurred during login." });
  }
});

// -------------------------------------------------------------
// 5. POST /logout - Destroy session & logout
// -------------------------------------------------------------
router.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
});

// Convenience GET logout
router.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
});

module.exports = router;
