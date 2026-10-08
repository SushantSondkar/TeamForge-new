const User = require("../models/User");

/**
 * Authentication Middleware: Protects routes requiring a logged-in user.
 * If user session exists and user is valid, attaches user to req.user.
 * Otherwise redirects to /login.
 */
async function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(401).json({ error: "Please log in to continue.", redirect: "/login" });
    }
    return res.redirect("/login");
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(401).json({ error: "Session expired. Please log in again.", redirect: "/login" });
      }
      return res.redirect("/login");
    }
    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    res.redirect("/login");
  }
}

module.exports = requireLogin;
