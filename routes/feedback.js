const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const { actionLimiter } = require("../middleware/rateLimiters");

/**
 * Sanitize Referer to keep only same-site pathname (no domain, no query, no hash, max 200 chars).
 * Returns empty string if invalid, external, or missing.
 */
function extractSameSitePath(rawReferer, hostHeader) {
  if (!rawReferer || typeof rawReferer !== "string") return "";
  try {
    if (rawReferer.startsWith("/")) {
      const pathname = rawReferer.split("?")[0].split("#")[0];
      return pathname.slice(0, 200);
    }
    const parsedUrl = new URL(rawReferer);
    if (hostHeader && parsedUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
      if (parsedUrl.pathname && parsedUrl.pathname.startsWith("/")) {
        return parsedUrl.pathname.slice(0, 200);
      }
    }
    return "";
  } catch (e) {
    return "";
  }
}

// -------------------------------------------------------------
// 1. GET /feedback - Feedback & Problem Reporting Form
// -------------------------------------------------------------
router.get("/feedback", (req, res) => {
  const isProblem = req.query.type === "problem";
  const selectedCategory = isProblem ? "bug" : (req.query.category || req.query.context || "general");
  const supportEmail = (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim())
    ? process.env.SUPPORT_EMAIL.trim()
    : "support@teamforge.kkwagh.edu.in";

  if (req.session) {
    const rawReferer = req.get("referer") || req.get("referrer");
    const hostHeader = req.get("host");
    const sanitizedPath = extractSameSitePath(rawReferer, hostHeader);

    // Ignore the Referer when its path is /feedback itself (page reloads or error re-renders),
    // and in that case keep the session value already saved.
    if (sanitizedPath === "/feedback") {
      // keep existing req.session.feedbackFromPath
    } else {
      req.session.feedbackFromPath = sanitizedPath || "";
    }
  }

  res.render("feedback", {
    currentUser: req.user || null,
    isProblem,
    selectedCategory,
    supportEmail,
    formData: {},
    pageTitle: isProblem ? "Report a Problem · TeamForge" : "Share Your Feedback · TeamForge"
  });
});

// -------------------------------------------------------------
// 2. POST /feedback - Submit Student Feedback or Problem Report
// -------------------------------------------------------------
router.post("/feedback", actionLimiter, async (req, res) => {
  const isProblem = req.body.type === "problem" || req.query.type === "problem" || req.body.category === "bug";
  const supportEmail = (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim())
    ? process.env.SUPPORT_EMAIL.trim()
    : "support@teamforge.kkwagh.edu.in";

  const renderWithError = (errMsg) => {
    return res.status(400).render("feedback", {
      currentUser: req.user || null,
      isProblem,
      selectedCategory: req.body.category || (isProblem ? "bug" : "general"),
      supportEmail,
      formData: req.body || {},
      error: errMsg,
      pageTitle: isProblem ? "Report a Problem · TeamForge" : "Share Your Feedback · TeamForge"
    });
  };

  try {
    const { rating, comment, category } = req.body;

    let parsedRating = null;
    const hasRating = rating !== undefined && rating !== null && String(rating).trim() !== "";

    if (!hasRating) {
      if (!isProblem) {
        return renderWithError("Please choose a rating.");
      }
    } else {
      parsedRating = parseInt(rating, 10);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return renderWithError("Please provide a valid rating from 1 to 5 stars.");
      }
    }

    const cleanCategory = ["general", "team_locked", "bug", "feature_request"].includes(category)
      ? category
      : (isProblem ? "bug" : "general");

    const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : "";

    // Retrieve pageUrl from session, then delete from session
    const pageUrl = (req.session && req.session.feedbackFromPath) ? req.session.feedbackFromPath : "";
    if (req.session) {
      delete req.session.feedbackFromPath;
    }

    const newFeedback = new Feedback({
      rating: parsedRating,
      comment: cleanComment,
      category: cleanCategory,
      userId: req.user ? req.user._id : null,
      pageUrl,
      status: "new"
    });

    await newFeedback.save();

    if (req.session) {
      req.session.success = isProblem
        ? "Thank you for reporting this issue. Your report has been submitted."
        : "Thank you for your feedback! Your thoughts help make TeamForge better for every student.";
    }

    if (req.user) {
      res.redirect("/dashboard");
    } else {
      res.redirect("/");
    }
  } catch (err) {
    console.error("Error saving feedback:", err);
    return renderWithError("An error occurred while saving your feedback. Please try again.");
  }
});

module.exports = router;
