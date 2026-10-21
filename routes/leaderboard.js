const express = require("express");
const router = express.Router();
const { getLeaderboard, filterLeaderboard } = require("../utils/leaderboardService");
const requireLogin = require("../middleware/auth");

// -------------------------------------------------------------
// GET /leaderboard - Campus Talent Leaderboard (Protected)
// -------------------------------------------------------------
router.get("/", requireLogin, async (req, res) => {
  try {
    const { branch, year, skill, refresh } = req.query;

    const { leaderboard, cachedAt, isCached } = await getLeaderboard(refresh === "true");

    const filteredEntries = filterLeaderboard(leaderboard, { branch, year, skill });

    res.render("leaderboard", {
      entries: filteredEntries,
      totalCount: leaderboard.length,
      cachedAt,
      isCached,
      filters: {
        branch: branch || "",
        year: year || "",
        skill: skill || ""
      },
      currentUser: req.user
    });
  } catch (err) {
    console.error("Error loading leaderboard:", err.message);
    res.render("leaderboard", {
      entries: [],
      totalCount: 0,
      cachedAt: new Date(),
      isCached: false,
      filters: {},
      currentUser: req.user,
      error: "Error loading leaderboard."
    });
  }
});

module.exports = router;
