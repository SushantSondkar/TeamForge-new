const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const { actionLimiter } = require("../middleware/rateLimiters");

// -------------------------------------------------------------
// 1. GET /feedback - Feedback Form Widget
// -------------------------------------------------------------
router.get("/feedback", (req, res) => {
  const category = req.query.category || req.query.context || "general";
  res.render("feedback", {
    currentUser: req.user || null,
    selectedCategory: category,
    pageTitle: "Share Your Feedback · TeamForge"
  });
});

// -------------------------------------------------------------
// 2. POST /feedback - Submit Student Feedback
// -------------------------------------------------------------
router.post("/feedback", actionLimiter, async (req, res) => {
  try {
    const { rating, comment, category } = req.body;

    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      if (req.session) {
        req.session.error = "Please provide a valid rating from 1 to 5 stars.";
      }
      return res.redirect("/feedback");
    }

    const cleanCategory = ["general", "team_locked", "bug", "feature_request"].includes(category)
      ? category
      : "general";

    const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : "";

    const newFeedback = new Feedback({
      rating: parsedRating,
      comment: cleanComment,
      category: cleanCategory,
      userId: req.user ? req.user._id : null
    });

    await newFeedback.save();

    if (req.session) {
      req.session.success = "Thank you for your feedback! Your thoughts help make TeamForge better for every student.";
    }

    if (req.user) {
      res.redirect("/dashboard");
    } else {
      res.redirect("/");
    }
  } catch (err) {
    console.error("Error saving feedback:", err);
    if (req.session) {
      req.session.error = "An error occurred while saving your feedback. Please try again.";
    }
    res.redirect("/feedback");
  }
});

module.exports = router;
